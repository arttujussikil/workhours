import SwiftUI
import SwiftData

struct TimerView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Job.createdAt) private var jobs: [Job]
    @Query(filter: #Predicate<WorkEntry> { $0.end == nil }, sort: \WorkEntry.start)
    private var running: [WorkEntry]
    @Query(sort: \WorkEntry.start, order: .reverse) private var allEntries: [WorkEntry]

    @State private var addingJob = false

    private var current: WorkEntry? { running.first }

    private var todayEntries: [WorkEntry] {
        allEntries.filter { Calendar.current.isDateInToday($0.start) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let current {
                    Section("Working now") {
                        RunningCard(entry: current) { stop(current) }
                    }
                }

                Section("Start working on") {
                    if jobs.isEmpty {
                        Button {
                            addingJob = true
                        } label: {
                            Label("Add your first job", systemImage: "plus.circle.fill")
                        }
                    }
                    ForEach(jobs) { job in
                        let isCurrent = current?.job?.persistentModelID == job.persistentModelID
                        Button {
                            start(job)
                        } label: {
                            HStack {
                                Circle().fill(job.color).frame(width: 12, height: 12)
                                Text(job.name)
                                Spacer()
                                if isCurrent {
                                    Text("Running").foregroundStyle(.secondary)
                                } else {
                                    Image(systemName: current == nil ? "play.circle.fill" : "arrow.triangle.swap")
                                        .font(.title2)
                                        .foregroundStyle(job.color)
                                }
                            }
                        }
                        .tint(.primary)
                        .disabled(isCurrent)
                    }
                }

                if !todayEntries.isEmpty {
                    Section("Today") {
                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            let total = todayEntries.reduce(0) { $0 + $1.duration(at: context.date) }
                            LabeledContent("Total", value: Fmt.hours(total))
                                .font(.headline)
                        }
                        ForEach(todayEntries) { entry in
                            EntryRow(entry: entry)
                        }
                    }
                }
            }
            .navigationTitle("Work Hours")
            .sheet(isPresented: $addingJob) { JobEditView(job: nil) }
        }
    }

    /// Starting a job stops whatever is running, so only one timer runs at a time.
    private func start(_ job: Job) {
        let now = Date.now
        for entry in running { entry.end = now }
        context.insert(WorkEntry(job: job, start: now))
    }

    private func stop(_ entry: WorkEntry) {
        entry.end = .now
    }
}

private struct RunningCard: View {
    let entry: WorkEntry
    let onStop: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle().fill(entry.job?.color ?? .gray).frame(width: 12, height: 12)
                Text(entry.job?.name ?? "No job").font(.headline)
                Spacer()
                Text("since \(Fmt.time(entry.start))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 4) {
                    Text(Fmt.clock(entry.duration(at: context.date)))
                        .font(.system(size: 52, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    if let rate = entry.job?.hourlyRate, rate > 0 {
                        Text(Fmt.money(entry.earnings(at: context.date)))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            Button(role: .destructive, action: onStop) {
                Label("Stop", systemImage: "stop.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding(.vertical, 8)
    }
}
