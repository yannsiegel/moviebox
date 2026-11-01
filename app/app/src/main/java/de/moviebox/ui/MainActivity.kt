package de.moviebox.ui

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import de.moviebox.data.SessionManager
import de.moviebox.ui.library.HomeTabs
import de.moviebox.ui.library.MovieDetailScreen
import de.moviebox.ui.library.ShowDetailScreen
import de.moviebox.ui.login.LoginScreen
import de.moviebox.ui.player.PlayerScreen
import de.moviebox.ui.theme.MovieBoxTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MovieBoxTheme {
                val state by SessionManager.state.collectAsState()
                val navController = rememberNavController()
                val start = if (state.token.isNotEmpty() && state.baseUrl.isNotEmpty()) "home" else "login"
                NavHost(navController = navController, startDestination = start) {
                    composable("login") {
                        LoginScreen(onLoggedIn = {
                            navController.navigate("home") {
                                popUpTo("login") { inclusive = true }
                            }
                        })
                    }
                    composable("home") {
                        HomeTabs(
                            onOpenMovie = { id -> navController.navigate("movie/$id") },
                            onOpenShow = { id -> navController.navigate("show/$id") },
                            onPlay = { id, title ->
                                val t = Uri.encode(title)
                                navController.navigate("player/$id?title=$t")
                            },
                            onLogout = {
                                SessionManager.clear()
                                navController.navigate("login") {
                                    popUpTo(0) { inclusive = true }
                                }
                            },
                        )
                    }
                    composable(
                        route = "movie/{id}",
                        arguments = listOf(navArgument("id") { type = NavType.StringType }),
                    ) { entry ->
                        val id = entry.arguments?.getString("id").orEmpty()
                        MovieDetailScreen(
                            movieId = id,
                            onBack = { navController.popBackStack() },
                            onPlay = { title ->
                                val t = Uri.encode(title)
                                navController.navigate("player/$id?title=$t")
                            },
                        )
                    }
                    composable(
                        route = "show/{id}",
                        arguments = listOf(navArgument("id") { type = NavType.StringType }),
                    ) { entry ->
                        val id = entry.arguments?.getString("id").orEmpty()
                        ShowDetailScreen(
                            showId = id,
                            onBack = { navController.popBackStack() },
                            onPlay = { episodeId, title ->
                                val t = Uri.encode(title)
                                navController.navigate("player/$episodeId?title=$t")
                            },
                        )
                    }
                    composable(
                        route = "player/{id}?title={title}",
                        arguments = listOf(
                            navArgument("id") { type = NavType.StringType },
                            navArgument("title") { type = NavType.StringType; defaultValue = "" },
                        ),
                    ) { entry ->
                        PlayerScreen(
                            mediaId = entry.arguments?.getString("id").orEmpty(),
                            title = Uri.decode(entry.arguments?.getString("title").orEmpty()),
                            onClose = { navController.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}
