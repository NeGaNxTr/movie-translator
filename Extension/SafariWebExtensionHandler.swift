import Foundation
import SafariServices

/// Native bridge for the Safari web extension. The interesting logic lives in
/// the JavaScript files (Resources/) - Swift only needs to answer the OS.
/// Toolbar clicks open the popup automatically because the manifest defines a
/// browser_action with a default_popup.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        var message: [String: Any] = ["error": "Malformed message"]

        if let item = context.inputItems.first as? NSExtensionItem,
           let userInfo = item.userInfo,
           let request = userInfo[SFExtensionMessageKey] as? [String: Any],
           let name = request["name"] as? String {
            switch name {
            case "hello", "open-popup":
                message = ["response": "OK"]
            default:
                break
            }
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: message]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}