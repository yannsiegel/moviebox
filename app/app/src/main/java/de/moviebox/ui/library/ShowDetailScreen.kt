package de.moviebox.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.launch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.moviebox.data.Api
import de.moviebox.data.MediaCard
import de.moviebox.data.ShowDetail

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShowDetailScreen(showId: String, onBack: () -> Unit, onPlay: (String, String) -> Unit) {
    val scope = rememberCoroutineScope()
    var show by remember { mutableStateOf<ShowDetail?>(null) }
    var seasons by remember { mutableStateOf<Map<String, List<MediaCard>>>(emptyMap()) }
    var subscribed by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmingDelete by remember { mutableStateOf<MediaCard?>(null) }

    LaunchedEffect(showId) {
        error = null
        try {
            val resp = Api.service.show(showId)
            show = resp.show
            seasons = resp.seasons
            subscribed = resp.subscribed
        } catch (ex: Exception) {
            error = ex.message
        }
    }

    suspend fun refresh() {
        try {
            val resp = Api.service.show(showId)
            show = resp.show
            seasons = resp.seasons
            subscribed = resp.subscribed
        } catch (_: Exception) {}
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(show?.title.orEmpty()) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        val s = show
        if (error != null) { Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { Text("Fehler: $error", color = MaterialTheme.colorScheme.error) }; return@Scaffold }
        if (s == null) { Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Scaffold }

        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(
                    Modifier.width(140.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface),
                    contentAlignment = Alignment.Center,
                ) {
                    if (s.poster != null) AsyncImage(model = s.poster, contentDescription = s.title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
                Column(Modifier.weight(1f)) {
                    Text(s.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    s.year?.let { Text(it.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    if (!s.overview.isNullOrEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(s.overview, style = MaterialTheme.typography.bodyMedium, maxLines = 6, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(10.dp))
                    FilledTonalButton(
                        onClick = {
                            val next = !subscribed
                            subscribed = next
                            scope.launch {
                                try {
                                    if (next) Api.service.subscribeShow(showId) else Api.service.unsubscribeShow(showId)
                                } catch (_: Exception) { subscribed = !next }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(
                            if (subscribed) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                            contentDescription = null,
                            tint = if (subscribed) Color(0xFFE94560) else MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(if (subscribed) "Abonniert" else "Abonnieren")
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            for ((seasonLabel, eps) in seasons.entries.sortedBy { it.key.toIntOrNull() ?: 0 }) {
                Text("Staffel $seasonLabel", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                for (ep in eps) {
                    EpisodeRow(
                        ep = ep,
                        onPlay = { onPlay(ep.id, episodeLabel(ep)) },
                        onToggleLike = {
                            scope.launch {
                                try {
                                    if (ep.liked) Api.service.unlikeMedia(ep.id) else Api.service.likeMedia(ep.id)
                                    refresh()
                                } catch (_: Exception) {}
                            }
                        },
                        onDelete = { confirmingDelete = ep },
                    )
                    Spacer(Modifier.height(8.dp))
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    confirmingDelete?.let { ep ->
        AlertDialog(
            onDismissRequest = { confirmingDelete = null },
            title = { Text("Folge löschen?") },
            text = { Text("S${ep.season}E${ep.episode}: ${ep.title}") },
            confirmButton = {
                TextButton(onClick = {
                    val id = ep.id
                    confirmingDelete = null
                    scope.launch {
                        try { Api.service.deleteMedia(id); refresh() } catch (_: Exception) {}
                    }
                }) { Text("Löschen", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = null }) { Text("Abbrechen") } },
        )
    }
}

@Composable
private fun EpisodeRow(
    ep: MediaCard,
    onPlay: () -> Unit,
    onToggleLike: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onPlay).padding(vertical = 4.dp),
    ) {
        Box(
            Modifier.width(140.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center,
        ) {
            if (ep.still != null) AsyncImage(model = ep.still, contentDescription = ep.title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Text("S${ep.season}E${ep.episode}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f)) {
            Text("S${ep.season}E${ep.episode?.toString()?.padStart(2, '0')}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
            Text(ep.title.ifEmpty { "Folge ${ep.episode}" }, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row {
                IconButton(onClick = onToggleLike, modifier = Modifier.width(36.dp)) {
                    Icon(
                        if (ep.liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = "Favorit",
                        tint = if (ep.liked) Color(0xFFE94560) else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onDelete, modifier = Modifier.width(36.dp)) {
                    Icon(Icons.Filled.Delete, contentDescription = "Löschen", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

private fun episodeLabel(ep: MediaCard): String {
    val head = "${ep.showTitle.orEmpty()} · S${ep.season}E${ep.episode?.toString()?.padStart(2, '0')}"
    return if (ep.title.isNotEmpty()) "$head · ${ep.title}" else head
}
