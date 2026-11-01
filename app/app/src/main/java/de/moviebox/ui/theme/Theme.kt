package de.moviebox.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Accent = Color(0xFFE94560)
private val BgDark = Color(0xFF0B0D10)
private val SurfaceDark = Color(0xFF11141A)
private val TextDark = Color(0xFFE6E8EB)
private val MutedDark = Color(0xFF9AA0A6)

private val DarkColors = darkColorScheme(
    primary = Accent,
    onPrimary = BgDark,
    background = BgDark,
    onBackground = TextDark,
    surface = SurfaceDark,
    onSurface = TextDark,
    surfaceVariant = SurfaceDark,
    onSurfaceVariant = MutedDark,
)

@Composable
fun MovieBoxTheme(content: @Composable () -> Unit) {
    // Dark-first for a video app; a light theme can be added later if ever needed.
    MaterialTheme(colorScheme = DarkColors, content = content)
}
