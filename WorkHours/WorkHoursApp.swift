import SwiftUI
import SwiftData

@main
struct WorkHoursApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Job.self, WorkEntry.self])
    }
}

struct ContentView: View {
    var body: some View {
        TabView {
            TimerView()
                .tabItem { Label("Timer", systemImage: "timer") }
            EntriesView()
                .tabItem { Label("Entries", systemImage: "list.bullet") }
            SummaryView()
                .tabItem { Label("Summary", systemImage: "chart.bar") }
            JobsView()
                .tabItem { Label("Jobs", systemImage: "briefcase") }
        }
    }
}
