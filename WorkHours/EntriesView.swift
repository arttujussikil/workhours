import SwiftUI
import SwiftData

struct EntriesView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \WorkEntry.start, order: .reverse) private var entries: [WorkEntry]

    @State private var editing: WorkEntry?
    @State private var addingNew = false

    private struct DayGroup: Identifiable {
        let day: Date
        let entries: [WorkEntry]
        var id: Date { day }
    }

    private var days: [DayGroup] {
        let groups = Dictionary(grouping: entries) { Calendar.current.startOfDay(for: $0.start) }
        return groups.keys.sorted(by: >).map { DayGroup(day: $0, entries: groups[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(days) { group in
                    Section {
                        ForEach(group.entries) { entry in
                            Button { editing = entry } label: { EntryRow(entry: entry) }
                                .tint(.primary)
                        }
                        .onDelete { offsets in
                            for index in offsets { context.delete(group.entries[index]) }
                        }
                    } header: {
                        HStack {
                            Text(group.day.formatted(.dateTime.weekday(.wide).day().month()))
                            Spacer()
                            Text(Fmt.hours(group.entries.reduce(0) { $0 + $1.duration() }))
                        }
                    }
                }
            }
            .overlay {
                if entries.isEmpty {
                    ContentUnavailableView(
                        "No entries yet",
                        systemImage: "clock",
                        description: Text("Start a timer or add hours manually with +.")
                    )
                }
            }
            .navigationTitle("Entries")
            .toolbar {
                Button { addingNew = true } label: { Image(systemName: "plus") }
            }
            .sheet(item: $editing) { EntryEditView(entry: $0) }
            .sheet(isPresented: $addingNew) { EntryEditView(entry: nil) }
        }
    }
}

struct EntryRow: View {
    let entry: WorkEntry

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(entry.job?.color ?? .gray)
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.job?.name ?? "No job").font(.body.weight(.medium))
                Text("\(Fmt.time(entry.start)) – \(entry.end.map(Fmt.time) ?? "now")"
                     + (entry.breakMinutes > 0 ? " · \(entry.breakMinutes) min break" : ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !entry.note.isEmpty {
                    Text(entry.note)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.hours(entry.duration())).monospacedDigit()
                if (entry.job?.hourlyRate ?? 0) > 0 {
                    Text(Fmt.money(entry.earnings()))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
