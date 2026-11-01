package de.moviebox.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import de.moviebox.data.SearchResponse
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onOpenMovie: (String) -> Unit,
    onOpenShow: (String) -> Unit,
    onPlay: (String, String) -> Unit,
) {
    var query by remember { mutableStateOf(TextFieldValue("")) }
    var data by remember { mutableStateOf<SearchResponse?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // debounce: wait 300ms after the last keystroke
    LaunchedEffect(query.text) {
        val q = query.text.trim()
        if (q.isEmpty()) { data = null; error = null; return@LaunchedEffect }
        delay(300)
        busy = true
        error = null
        try { data = Api.service.searchLibrary(q) }
        catch (ex: Exception) { error = ex.message; data = null }
        busy = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Suche in Bibliothek") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).padding(16.dp)) {
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text("Film, Serie oder Folge …") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            when {
                error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Fehler: $error", color = MaterialTheme.colorScheme.error) }
                busy -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Tippe etwas, um in deiner Bibliothek zu suchen.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                else -> SearchResults(data!!, onOpenMovie, onOpenShow, onPlay)
            }
        }
    }
}

@Composable
private fun SearchResults(
    data: SearchResponse,
    onOpenMovie: (String) -> Unit,
    onOpenShow: (String) -> Unit,
    onPlay: (String, String) -> Unit,
) {
    val total = data.movies.size + data.shows.size + data.episodes.size
    if (total == 0) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Nichts in deiner Bibliothek passt.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        if (data.movies.isNotEmpty()) {
            Text("Filme (${data.movies.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            SearchGrid(onClick = { onOpenMovie(it.id) }, items = data.movies.map { CardSpec(it.id, it.title, it.year?.toString(), it.poster, it.progressFraction()) })
            Spacer(Modifier.height(16.dp))
        }
        if (data.shows.isNotEmpty()) {
            Text("Serien (${data.shows.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            SearchGrid(onClick = { onOpenShow(it.id) }, items = data.shows.map { CardSpec(it.id, it.title, it.year?.toString(), it.poster, null) })
            Spacer(Modifier.height(16.dp))
        }
        if (data.episodes.isNotEmpty()) {
            Text("Folgen (${data.episodes.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            SearchGrid(onClick = { card -> data.episodes.firstOrNull { it.id == card.id }?.let { ep -> onPlay(ep.id, "${ep.showTitle} · S${ep.season}E${ep.episode?.toString()?.padStart(2, '0')}") } },
                items = data.episodes.map { CardSpec(it.id, it.title.ifEmpty { "Folge ${it.episode}" }, "${it.showTitle} · S${it.season}E${it.episode?.toString()?.padStart(2, '0')}", it.still ?: it.poster, it.progressFraction()) })
        }
    }
}

private data class CardSpec(val id: String, val title: String, val subtitle: String?, val poster: String?, val progress: Float?)

@Composable
private fun SearchGrid(onClick: (CardSpec) -> Unit, items: List<CardSpec>) {
    // the enclosing Column scrolls; a nested LazyGrid would collide, so render as a plain flow
    val perRow = 3
    val rows = items.chunked(perRow)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in rows) {
            androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (item in row) {
                    Box(Modifier.weight(1f)) {
                        PosterCard(item.title, item.subtitle, item.poster, item.progress) { onClick(item) }
                    }
                }
                repeat(perRow - row.size) { Box(Modifier.weight(1f)) {} }
            }
        }
    }
}
