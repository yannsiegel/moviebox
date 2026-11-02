package de.moviebox.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import de.moviebox.data.HomeResponse
import de.moviebox.data.LibrarySummary
import de.moviebox.data.ResumeCache

@Composable
fun HomeScreen(
    onOpenMovie: (String) -> Unit,
    onPlay: (String, String) -> Unit,
    contentPad: PaddingValues,
    refreshKey: Int,
) {
    var data by remember { mutableStateOf<HomeResponse?>(null) }
    var summary by remember { mutableStateOf<LibrarySummary?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(refreshKey) {
        error = null
        try {
            data = Api.service.home()
            summary = try { Api.service.librarySummary() } catch (_: Exception) { null }
            ResumeCache.refresh()
        } catch (ex: Exception) { error = ex.message }
    }

    val d = data
    if (error != null) {
        Box(Modifier.fillMaxSize().padding(contentPad), contentAlignment = Alignment.Center) {
            Text("Fehler: $error", color = MaterialTheme.colorScheme.error)
        }
        return
    }
    if (d == null) {
        Box(Modifier.fillMaxSize().padding(contentPad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    if (d.`continue`.isEmpty() && d.recentMovies.isEmpty() && d.recentEpisodes.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(
                "Noch keine Inhalte. Lege Videodateien in den Medienordner und tippe oben rechts auf das Aktualisieren-Symbol.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    androidx.compose.foundation.layout.Column(
        Modifier.fillMaxSize().padding(contentPad).verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        summary?.let { s ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                StatChip("Filme", s.movies)
                StatChip("Serien", s.shows)
                StatChip("Folgen", s.episodes)
            }
        }
        if (d.`continue`.isNotEmpty()) {
            SectionTitle("Weiter schauen")
            MediaGrid(d.`continue`, onOpenMovie, onPlay)
            Spacer(Modifier.height(24.dp))
        }
        if (d.recentMovies.isNotEmpty()) {
            SectionTitle("Neue Filme")
            MediaGrid(d.recentMovies, onOpenMovie, onPlay)
            Spacer(Modifier.height(24.dp))
        }
        if (d.recentEpisodes.isNotEmpty()) {
            SectionTitle("Neue Folgen")
            MediaGrid(d.recentEpisodes, onOpenMovie, onPlay)
        }
    }
}

@Composable
private fun SectionTitle(label: String) {
    Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
private fun StatChip(label: String, value: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.width(6.dp))
        Text(value.toString(), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun MediaGrid(
    items: List<de.moviebox.data.MediaCard>,
    onOpenMovie: (String) -> Unit,
    onPlay: (String, String) -> Unit,
) {
    // The home sections are short - a non-scrolling flow is simplest.
    val perRow = 3
    val rows = items.chunked(perRow)
    androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in rows) {
            androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (item in row) {
                    Box(Modifier.weight(1f)) {
                        PosterCard(
                            title = item.title,
                            subtitle = item.subtitleLabel(),
                            poster = item.poster ?: item.still,
                            progressFraction = item.progressFraction(),
                            mediaId = item.id,
                            onClick = {
                                if (item.kind == "episode") onPlay(item.id, label(item))
                                else onOpenMovie(item.id)
                            },
                        )
                    }
                }
                // keep the row grid even when it's not full
                repeat(perRow - row.size) { Box(Modifier.weight(1f)) {} }
            }
        }
    }
}

private fun label(item: de.moviebox.data.MediaCard): String = buildString {
    item.showTitle?.let { append(it); append(" · ") }
    if (item.season != null && item.episode != null) {
        append("S${item.season}E").append(item.episode.toString().padStart(2, '0'))
    }
    if (item.title.isNotEmpty()) {
        if (isNotEmpty()) append(" · ")
        append(item.title)
    }
}
