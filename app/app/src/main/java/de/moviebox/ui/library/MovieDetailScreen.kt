package de.moviebox.ui.library

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.rememberCoroutineScope
import de.moviebox.data.Api
import de.moviebox.data.MovieDetail
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovieDetailScreen(movieId: String, onBack: () -> Unit, onPlay: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var movie by remember { mutableStateOf<MovieDetail?>(null) }
    var positionSec by remember { mutableStateOf(0.0) }
    var error by remember { mutableStateOf<String?>(null) }
    var liked by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }

    LaunchedEffect(movieId) {
        error = null
        try {
            val m = Api.service.movie(movieId).movie
            movie = m
            liked = m.liked
            positionSec = Api.service.getResume(movieId).positionSec
        } catch (ex: Exception) {
            error = ex.message
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(movie?.title.orEmpty()) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        val m = movie
        if (error != null) { Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { Text("Fehler: $error", color = MaterialTheme.colorScheme.error) }; return@Scaffold }
        if (m == null) { Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Scaffold }

        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(
                    Modifier.width(140.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surface),
                    contentAlignment = Alignment.Center,
                ) {
                    if (m.poster != null) AsyncImage(model = m.poster, contentDescription = m.title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else Text(m.title, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
                }
                Column(Modifier.weight(1f)) {
                    Text(m.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    val sub = buildList {
                        m.year?.let { add(it.toString()) }
                        m.runtimeSec?.let { add("${(it / 60).toInt()} min") }
                        if (m.genres.isNotEmpty()) add(m.genres.joinToString(", "))
                    }.joinToString(" · ")
                    if (sub.isNotEmpty()) Text(sub, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(12.dp))
                    val label = if (positionSec > 15) "Fortsetzen bei ${formatTime(positionSec)}" else "Abspielen"
                    Button(onClick = { onPlay(m.title) }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text(label)
                    }
                    Spacer(Modifier.height(8.dp))
                    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(
                            onClick = {
                                val next = !liked
                                liked = next
                                scope.launch {
                                    try {
                                        if (next) Api.service.likeMedia(movieId) else Api.service.unlikeMedia(movieId)
                                    } catch (_: Exception) { liked = !next }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = null,
                                tint = if (liked) Color(0xFFE94560) else MaterialTheme.colorScheme.onSurface)
                            Spacer(Modifier.width(6.dp))
                            Text("Favorit")
                        }
                        OutlinedButton(
                            onClick = { confirmingDelete = true },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(6.dp))
                            Text("Löschen", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            if (!m.overview.isNullOrEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text(m.overview, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text("Film löschen?") },
            text = { Text("Datei im Medienordner wird mitgelöscht. Nicht rückgängig zu machen.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    scope.launch {
                        try { Api.service.deleteMedia(movieId); onBack() }
                        catch (_: Exception) {}
                    }
                }) { Text("Löschen", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text("Abbrechen") } },
        )
    }
}

internal fun formatTime(sec: Double): String {
    val s = sec.toInt()
    val h = s / 3600
    val m = (s % 3600) / 60
    val r = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, r) else "%d:%02d".format(m, r)
}
