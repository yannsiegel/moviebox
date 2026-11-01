package de.moviebox.ui.player

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import de.moviebox.data.Api
import de.moviebox.data.MediaCard
import de.moviebox.data.ResumeUpdate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Fullscreen video player. Loads resume position on open, writes it back every 10s
 * and again on exit. A local ExoPlayer instance (not the service) so closing the
 * screen stops playback cleanly; the service version takes over once background
 * audio and lock-screen controls are needed in a later stage.
 */
@UnstableApi
@Composable
fun PlayerScreen(mediaId: String, title: String, onClose: () -> Unit, onPlayNext: (String, String) -> Unit = { _, _ -> }) {
    val context = LocalContext.current
    val streamUrl = remember(mediaId) { Api.streamUrl(mediaId) }
    // scope kept alive for the final resume write on exit
    val finalScope = remember { CoroutineScope(SupervisorJob() + Dispatchers.Main) }
    var nextEpisode by androidx.compose.runtime.mutableStateOf<MediaCard?>(null).let { androidx.compose.runtime.remember { it } }

    val player = remember {
        val sourceFactory = DefaultMediaSourceFactory(context).setDataSourceFactory(
            DefaultHttpDataSource.Factory().setDefaultRequestProperties(mapOf("Authorization" to "Bearer ${Api.token}"))
        )
        ExoPlayer.Builder(context).setMediaSourceFactory(sourceFactory).build().apply {
            setMediaItem(MediaItem.fromUri(streamUrl))
            prepare()
            playWhenReady = true
        }
    }

    // Listen for playback end; if this is an episode, offer the next one.
    androidx.compose.runtime.DisposableEffect(mediaId) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    finalScope.launch {
                        try {
                            // next-episode endpoint returns 404 for a movie id; the catch covers that.
                            nextEpisode = runCatching { Api.service.episodeNext(mediaId).next }.getOrNull()
                        } catch (_: Exception) {}
                    }
                }
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    // Resume seek + periodic position reporting while the screen is on.
    LaunchedEffect(mediaId) {
        try {
            val resume = Api.service.getResume(mediaId)
            if (resume.positionSec > 15) player.seekTo((resume.positionSec * 1000).toLong())
        } catch (_: Exception) { /* server offline: play from start */ }

        while (isActive) {
            delay(10_000)
            try {
                val posSec = player.currentPosition / 1000.0
                val durSec = (player.duration.takeIf { it > 0 } ?: 0L) / 1000.0
                if (posSec > 0) Api.service.postResume(mediaId, ResumeUpdate(posSec, durSec))
            } catch (_: Exception) { /* keep playing even if the server is briefly unreachable */ }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            val posSec = player.currentPosition / 1000.0
            val durSec = (player.duration.takeIf { it > 0 } ?: 0L) / 1000.0
            player.release()
            finalScope.launch {
                try {
                    if (posSec > 0) Api.service.postResume(mediaId, ResumeUpdate(posSec, durSec))
                } catch (_: Exception) {}
                finalScope.cancel()
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = true
                    // Media3's built-in subtitle button and settings menu let the user
                    // switch between audio tracks and embedded/sidecar subtitles.
                    setShowSubtitleButton(true)
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
        Text(
            title,
            color = Color.White,
            modifier = Modifier.align(Alignment.TopStart).padding(16.dp).background(Color(0x99000000)).padding(horizontal = 10.dp, vertical = 6.dp),
            style = MaterialTheme.typography.bodyMedium,
        )
        IconButton(
            onClick = {
                player.stop()
                onClose()
            },
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).size(44.dp).background(Color(0x99000000), CircleShape),
        ) {
            Icon(Icons.Filled.Close, contentDescription = "Schließen", tint = Color.White)
        }
    }

    nextEpisode?.let { next ->
        AlertDialog(
            onDismissRequest = { nextEpisode = null },
            title = { Text("Nächste Folge") },
            text = {
                Text("${next.showTitle} · S${next.season}E${next.episode?.toString()?.padStart(2, '0')}${if (next.title.isNotEmpty()) " · ${next.title}" else ""}")
            },
            confirmButton = {
                Button(onClick = {
                    val nextId = next.id
                    val nextTitle = "${next.showTitle} · S${next.season}E${next.episode?.toString()?.padStart(2, '0')}${if (next.title.isNotEmpty()) " · ${next.title}" else ""}"
                    nextEpisode = null
                    onPlayNext(nextId, nextTitle)
                }) { Text("Abspielen") }
            },
            dismissButton = { TextButton(onClick = { nextEpisode = null; onClose() }) { Text("Fertig") } },
        )
    }
}
