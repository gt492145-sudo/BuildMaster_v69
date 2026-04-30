import SwiftUI
import WebKit

private struct WebCalcView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = .black
        webView.isOpaque = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url == nil || webView.url?.absoluteString != url.absoluteString {
            webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }
    }
}

struct WebCalcHostView: View {
    // Phone build opens the same calculation app page as desktop web.
    private let calcEntryURL = URL(string: "https://www.wenwenming.com/")!

    var body: some View {
        WebCalcView(url: calcEntryURL)
            .ignoresSafeArea()
    }
}
