package de.moviebox.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.moviebox.data.Api
import de.moviebox.data.DiscoverItem
import kotlinx.coroutines.delay

@Composable
fun DiscoverScreen(contentPad: PaddingValues, refreshKey: Int) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<DiscoverItem>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var heading by remember { mutableStateOf("Aktuell beliebt") }

    LaunchedEffect(refreshKey) {
        busy = true
        try {
            results = Api.service.discoverTrending().results
            heading = "Aktuell beliebt"
            error = null
        } catch (ex: Exception) {
            error = ex.message
            results = emptyList()
        } finally {
            busy = false
        }
    }

    LaunchedEffect(query) {
        val q = query.trim()
        if (q.isEmpty()) return@LaunchedEffect
        delay(300)
        busy = true
        try {
            results = Api.service.discoverSearch(q).results
            heading = "Suche: „$q\""
            error = null
        } catch (ex: Exception) {
            error = ex.message
            results = emptyList()
        } finally {
            busy = false
        }
    }

    Column(Modifier.fillMaxSize().padding(contentPad).padding(16.dp)) {
        Text(
            "Entdecken – was gibt es?",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Suche in TMDB nach Titeln, um zu sehen was es gibt. Herunterladen geht daraus nicht – die Datei legst du selbst in den Medienordner, dann holt MovieBox Poster und Infos automatisch.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = query, onValueChange = { query = it },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text("Film oder Serie …") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        Text(heading, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))

        when {
            error != null && (results == null || results!!.isEmpty()) ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("TMDB nicht verfügbar.", color = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.height(4.dp))
                        Text(error ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(8.dp))
                        Text("Trag im Server-.env einen TMDB-Key ein, dann klappt's.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
            busy -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            results != null -> DiscoverGrid(results!!)
            else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        }
    }
}

@Composable
private fun DiscoverGrid(items: List<DiscoverItem>) {
    if (items.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Nichts gefunden.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 130.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(items, key = { it.tmdbId.toString() + it.kind }) { it ->
            DiscoverCard(it)
        }
    }
}

@Composable
private fun DiscoverCard(item: DiscoverItem) {
    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center,
        ) {
            if (item.poster != null) AsyncImage(model = item.poster, contentDescription = item.title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Text(item.title, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(10.dp))
            Text(
                if (item.kind == "movie") "FILM" else "SERIE",
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.align(Alignment.TopStart).padding(6.dp)
                    .background(Color(0xCC000000), RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
            item.rating?.let {
                androidx.compose.foundation.layout.Row(
                    modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp)
                        .background(Color(0xCC000000), RoundedCornerShape(999.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Star, contentDescription = null, tint = Color(0xFFFBBF24), modifier = Modifier.height(12.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(" ${"%.1f".format(it)}", color = Color(0xFFFBBF24), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(item.title, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
        if (item.year != null) {
            Text(item.year, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        }
    }
}
