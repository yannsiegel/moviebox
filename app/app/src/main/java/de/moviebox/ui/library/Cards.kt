package de.moviebox.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.moviebox.data.MediaCard
import de.moviebox.data.ShowSummary

@Composable
fun PosterCard(
    title: String,
    subtitle: String?,
    poster: String?,
    progressFraction: Float? = null,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier.clickable(onClick = onClick).padding(4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center,
        ) {
            if (poster != null) {
                AsyncImage(model = poster, contentDescription = title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(10.dp))
            }
        }
        if (progressFraction != null && progressFraction > 0f) {
            Spacer(Modifier.height(4.dp))
            Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colorScheme.surface)) {
                Box(Modifier.fillMaxWidth(progressFraction.coerceAtMost(1f)).fillMaxSize().background(MaterialTheme.colorScheme.primary))
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodyMedium)
        if (subtitle != null) {
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

fun MediaCard.subtitleLabel(): String? = when (kind) {
    "episode" -> buildString {
        showTitle?.let { append(it) }
        if (season != null && episode != null) {
            if (isNotEmpty()) append(" · ")
            append("S${season}E").append(episode.toString().padStart(2, '0'))
        }
    }.ifEmpty { null }
    else -> year?.toString()
}

fun MediaCard.progressFraction(): Float? {
    val pos = positionSec ?: return null
    val dur = runtimeSec ?: return null
    if (dur <= 0) return null
    return (pos / dur).toFloat()
}

fun ShowSummary.subtitleLabel(): String? = year?.toString()
