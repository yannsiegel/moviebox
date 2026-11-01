package de.moviebox.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import de.moviebox.data.MediaCard

@Composable
fun MoviesScreen(onOpenMovie: (String) -> Unit, contentPad: PaddingValues, refreshKey: Int) {
    var items by remember { mutableStateOf<List<MediaCard>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(refreshKey) {
        error = null
        try { items = Api.service.movies().movies }
        catch (ex: Exception) { error = ex.message }
    }

    val list = items
    if (error != null) { Box(Modifier.fillMaxSize().padding(contentPad), contentAlignment = Alignment.Center) { Text("Fehler: $error", color = MaterialTheme.colorScheme.error) }; return }
    if (list == null) { Box(Modifier.fillMaxSize().padding(contentPad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return }
    if (list.isEmpty()) { Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Text("Keine Filme gefunden.", color = MaterialTheme.colorScheme.onSurfaceVariant) }; return }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 120.dp),
        modifier = Modifier.fillMaxSize().padding(contentPad),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(list, key = { it.id }) { m ->
            PosterCard(
                title = m.title,
                subtitle = m.subtitleLabel(),
                poster = m.poster,
                progressFraction = m.progressFraction(),
                onClick = { onOpenMovie(m.id) },
            )
        }
    }
}
