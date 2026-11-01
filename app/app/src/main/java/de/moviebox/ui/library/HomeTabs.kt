package de.moviebox.ui.library

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.moviebox.data.Api
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeTabs(
    onOpenMovie: (String) -> Unit,
    onOpenShow: (String) -> Unit,
    onPlay: (String, String) -> Unit,
    onSearch: () -> Unit,
    onLogout: () -> Unit,
) {
    val tabs = listOf("Start", "Filme", "Serien", "Entdecken")
    val pagerState = rememberPagerState(pageCount = { tabs.size })
    val scope = rememberCoroutineScope()
    var refreshKey by remember { mutableStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("MovieBox") },
                actions = {
                    IconButton(onClick = onSearch) {
                        Icon(Icons.Filled.Search, contentDescription = "Suchen")
                    }
                    IconButton(onClick = {
                        scope.launch {
                            try { Api.service.adminScan() } catch (_: Exception) {}
                            kotlinx.coroutines.delay(1500)
                            refreshKey++
                        }
                    }) { Icon(Icons.Filled.Refresh, contentDescription = "Jetzt scannen") }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Filled.ExitToApp, contentDescription = "Abmelden")
                    }
                },
            )
        },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            androidx.compose.foundation.layout.Column(Modifier.fillMaxSize()) {
                ScrollableTabRow(selectedTabIndex = pagerState.currentPage, edgePadding = 0.dp) {
                    tabs.forEachIndexed { index, label ->
                        Tab(
                            selected = pagerState.currentPage == index,
                            onClick = { scope.launch { pagerState.animateScrollToPage(index) } },
                            text = { Text(label) },
                        )
                    }
                }
                HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                    val contentPad = PaddingValues(0.dp)
                    when (page) {
                        0 -> HomeScreen(onOpenMovie, onPlay, contentPad, refreshKey)
                        1 -> MoviesScreen(onOpenMovie, contentPad, refreshKey)
                        2 -> ShowsScreen(onOpenShow, contentPad, refreshKey)
                        3 -> DiscoverScreen(contentPad, refreshKey)
                    }
                }
            }
        }
    }
}
