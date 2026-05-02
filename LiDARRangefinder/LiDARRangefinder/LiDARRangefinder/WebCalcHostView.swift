import SwiftUI
import WebKit

private final class WebCalcNavigationLogger: NSObject, WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("BM WebView URL:", webView.url?.absoluteString ?? "nil")
    }
}

private struct WebCalcView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> WebCalcNavigationLogger {
        WebCalcNavigationLogger()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.navigationDelegate = context.coordinator
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url == nil || webView.url?.absoluteString != url.absoluteString {
            if url.isFileURL {
                webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            } else {
                webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
            }
        }
    }
}

struct WebCalcHostView: View {
    // Phone builds prefer the bundled V9.6 web app so Xcode runs do not show
    // stale GitHub Pages content while a release is still waiting to deploy.
    private let calcEntryURL = Bundle.main.url(
        forResource: "index",
        withExtension: "html",
        subdirectory: "WebApp"
    ) ?? URL(string: "https://gt492145-sudo.github.io/BuildMaster_v69/index.html")!

    var body: some View {
        WebCalcView(url: calcEntryURL)
            .ignoresSafeArea()
    }
}
