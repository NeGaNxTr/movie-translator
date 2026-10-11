import SwiftUI
import UIKit

struct ContentView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("🎬 Movie Translator")
                        .font(.largeTitle.bold())

                    Text("Installs a Safari extension that translates movie subtitles on any website into any language — free, no API key required.")
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 14) {
                        step(1, "Install this app (you're here).")
                        step(2, "Open the Settings app → Safari → Extensions.")
                        step(3, "Turn on “Movie Translator” and allow it on all websites.")
                        step(4, "Open your movie in Safari, pick your language in the extension popup, and press Safari’s “Aa” or extension button to toggle it.")
                    }

                    Button(action: openSettings) {
                        Text("Open Settings")
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.accentColor)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }

                    Text("Next time you refresh a movie page in Safari, subtitles appear translated. Tip-card: after changing the target language, reload the page.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding()
            }
            .navigationTitle("Movie Translator")
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)")
                .font(.subheadline.monospacedDigit().bold())
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color.accentColor.opacity(0.22)))
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func openSettings() {
        UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)
    }
}

#Preview {
    ContentView()
}