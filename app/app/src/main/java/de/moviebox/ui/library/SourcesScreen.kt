package de.moviebox.ui.library

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import de.moviebox.data.DiscoverSource
import de.moviebox.data.SourceAddRequest
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourcesScreen(
    tmdbId: Long,
    kind: String,
    title: String,
    year: Int?,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var sources by remember { mutableStateOf<List<DiscoverSource>?>(null) }
    var torrentAvailable by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(tmdbId, kind) {
        try {
            val resp = Api.service.discoverSources(tmdbId = tmdbId, kind = kind, title = title, year = year)
            sources = resp.sources
            torrentAvailable = resp.capabilities["torrent"] ?: false
        } catch (ex: Exception) {
            error = ex.message
            sources = emptyList()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Quellen für „$title\"", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(
                "Alle verfügbaren Backends werden gleichzeitig abgefragt (archive.org, TorrentIO).",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            if (!torrentAvailable) {
                Spacer(Modifier.height(10.dp))
                Text(
                    "⚠ Torrent-backend nicht verfügbar (webtorrent nicht installiert). Nur archive.org und Direkt-URLs klappen.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Spacer(Modifier.height(16.dp))

            when {
                error != null -> Text("Fehler: $error", color = MaterialTheme.colorScheme.error)
                sources == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                sources!!.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Keine Quellen gefunden.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                else -> for (src in sources!!) {
                    SourceRow(src, onPick = { mode ->
                        val url = src.magnet ?: src.url
                        if (url == null) { toast = "Keine URL"; return@SourceRow }
                        toast = null
                        scope.launch {
                            try {
                                Api.service.sourcesAdd(SourceAddRequest(url, mode))
                                toast = if (mode == "preview") "Preview-Download läuft …" else "Download läuft …"
                            } catch (ex: Exception) {
                                toast = ex.message
                            }
                        }
                    })
                    Spacer(Modifier.height(8.dp))
                }
            }

            toast?.let {
                Spacer(Modifier.height(16.dp))
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun SourceRow(src: DiscoverSource, onPick: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(src.title, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        val sub = buildList {
            add(src.backend)
            src.quality?.let { add(it) }
            src.sizeBytes?.let { add("%.2f GB".format(it / 1_073_741_824.0)) }
            src.seeders?.let { add("$it seeders") }
            src.language?.let { add(it) }
            src.provider?.let { add(it) }
        }
        Text(sub.joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onPick("preview") }, modifier = Modifier.weight(1f)) { Text("Preview") }
            Button(onClick = { onPick("keep") }, modifier = Modifier.weight(1f)) { Text("Behalten") }
        }
    }
}
