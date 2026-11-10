import SwiftUI
import SwiftData

/// Add hours manually (`entry == nil`) or edit an existing entry.
struct EntryEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Job.createdAt) private var jobs: [Job]

    let entry: WorkEntry?

    @State private var job: Job?
    @State private var start: Date
    @State private var end: Date
    @State private var isRunning: Bool
    @State private var breakMinutes: Int
    @State private var note: String

    init(entry: WorkEntry?) {
        self.entry = entry
        let now = Date.now
        _job = State(initialValue: entry?.job)
        _start = State(initialValue: entry?.start ?? now.addingTimeInterval(-8 * 3600))
        _end = State(initialValue: entry?.end ?? now)
        _isRunning = State(initialValue: entry?.isRunning ?? false)
        _breakMinutes = State(initialValue: entry?.breakMinutes ?? 0)
        _note = State(initialValue: entry?.note ?? "")
    }

    private var total: TimeInterval {
        max(0, end.timeIntervalSince(start) - Double(breakMinutes) * 60)
    }

    private var canSave: Bool {
        job != nil && (isRunning || end > start)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Job", selection: $job) {
                        Text("Choose…").tag(Job?.none)
                        ForEach(jobs) { job in
                            Text(job.name).tag(Optional(job))
                        }
                    }
                }

                Section {
                    DatePicker("Start", selection: $start)
                    if entry?.isRunning == true {
                        Toggle("Still running", isOn: $isRunning)
                    }
                    if !isRunning {
                        DatePicker("End", selection: $end, in: start...)
                    }
                    Stepper("Break: \(breakMinutes) min", value: $breakMinutes, in: 0...480, step: 5)
                }

                Section("Note") {
                    TextField("Optional", text: $note, axis: .vertical)
                }

                if !isRunning {
                    Section {
                        LabeledContent("Total", value: Fmt.hours(total))
                        if let rate = job?.hourlyRate, rate > 0 {
                            LabeledContent("Earnings", value: Fmt.money(total / 3600 * rate))
                        }
                    }
                }

                if let entry {
                    Section {
                        Button("Delete Entry", role: .destructive) {
                            context.delete(entry)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(entry == nil ? "Add Hours" : "Edit Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).disabled(!canSave)
                }
            }
            .onAppear {
                if job == nil { job = jobs.first }
            }
        }
    }

    private func save() {
        let target: WorkEntry
        if let entry {
            target = entry
        } else {
            target = WorkEntry(job: job, start: start)
            context.insert(target)
        }
        target.job = job
        target.start = start
        target.end = isRunning ? nil : end
        target.breakMinutes = breakMinutes
        target.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        dismiss()
    }
}
