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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
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
    var nextEpisode by remember { mutableStateOf<MediaCard?>(null) }

    val player = remember {
        val sourceFactory = DefaultMediaSourceFactory(context).setDataSourceFactory(
            DefaultHttpDataSource.Factory().setDefaultRequestProperties(mapOf("Authorization" to "Bearer ${Api.token}"))
        )
        // Enable extension (software) renderers as a fallback for codecs the device's hardware
        // decoder can't handle - this catches a lot of "schwarzer screen bei HEVC/10bit" cases.
        val renderers = DefaultRenderersFactory(context)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .setEnableDecoderFallback(true)
        // Give the player a generous buffer so slow-start streams don't give up at the first stall.
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                15_000,      // minBufferMs
                60_000,      // maxBufferMs
                1_500,       // bufferForPlaybackMs
                3_000,       // bufferForPlaybackAfterRebufferMs
            )
            .build()
        ExoPlayer.Builder(context, renderers)
            .setMediaSourceFactory(sourceFactory)
            .setLoadControl(loadControl)
            .build().apply {
                setMediaItem(MediaItem.fromUri(streamUrl))
                prepare()
                playWhenReady = true
            }
    }

    // Capture playback errors + state so we can show the user what actually broke.
    var playerError by remember { mutableStateOf<String?>(null) }
    var playerState by remember { mutableStateOf<String?>(null) }

    // Listen for playback end + errors; the error overlay is the whole point of this screen
    // being useful when something breaks on an unknown codec.
    DisposableEffect(mediaId) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                playerState = when (state) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> "BUFFERING"
                    Player.STATE_READY -> null
                    Player.STATE_ENDED -> {
                        finalScope.launch {
                            try { nextEpisode = runCatching { Api.service.episodeNext(mediaId).next }.getOrNull() }
                            catch (_: Exception) {}
                        }
                        "ENDED"
                    }
                    else -> null
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                val code = error.errorCodeName
                val cause = error.cause?.message ?: ""
                playerError = "Fehler $code\n${error.message}\n$cause".trim()
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

        // Full-screen diagnostic overlay when playback can't start / crashes
        playerError?.let { msg ->
            Box(
                Modifier.fillMaxSize().background(Color(0xDD000000)).padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Wiedergabe fehlgeschlagen", color = Color(0xFFE94560), style = MaterialTheme.typography.titleLarge)
                    androidx.compose.foundation.layout.Spacer(Modifier.size(12.dp))
                    Text(msg, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                    androidx.compose.foundation.layout.Spacer(Modifier.size(16.dp))
                    Text(
                        "Häufigste ursachen:\n• codec vom gerät nicht unterstützt (10-bit HEVC, Dolby Vision)\n• datei noch unvollständig heruntergeladen\n• netzwerk-timeout",
                        color = Color(0xFFCCCCCC), style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        // Buffering state readout bottom-left
        playerState?.let { st ->
            Text(
                st,
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.align(Alignment.BottomStart).padding(16.dp)
                    .background(Color(0x99000000), CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
            )
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
