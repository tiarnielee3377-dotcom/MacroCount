import Capacitor
import StoreKit

@available(iOS 15.0, *)
@objc(AppleStorePlugin)
public class AppleStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleStorePlugin"
    public let jsName = "AppleStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recover", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
    ]
    private var updatesTask: Task<Void, Never>?

    private let productPlans = [
        "macrocount_weekly_ios": "weekly",
        "macrocount_monthly_ios": "monthly",
        "macrocount_yearly_ios": "yearly",
    ]

    public override func load() {
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result,
                      self?.productPlans[transaction.productID] != nil else {
                    continue
                }
                self?.notifyListeners("transactionUpdated", data: [
                    "transactionId": String(transaction.id),
                    "signedTransaction": result.jwsRepresentation,
                ])
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: Array(productPlans.keys))
                let result = products.compactMap { product -> [String: Any]? in
                    guard let plan = productPlans[product.id] else { return nil }
                    return [
                        "id": product.id,
                        "plan": plan,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                    ]
                }.sorted {
                    let order = ["weekly": 0, "monthly": 1, "yearly": 2]
                    return (order[$0["plan"] as? String ?? ""] ?? 99) <
                        (order[$1["plan"] as? String ?? ""] ?? 99)
                }
                call.resolve(["products": result])
            } catch {
                call.reject("Unable to load App Store products.", "PRODUCTS_UNAVAILABLE", error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), productPlans[productId] != nil else {
            call.reject("A valid App Store product is required.", "INVALID_PRODUCT")
            return
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("This subscription is not available from the App Store.", "PRODUCT_UNAVAILABLE")
                    return
                }

                switch try await product.purchase() {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        call.resolve([
                            "transactionId": String(transaction.id),
                            "signedTransaction": verification.jwsRepresentation,
                        ])
                    case .unverified(_, let error):
                        call.reject("The App Store could not verify this purchase.", "UNVERIFIED_TRANSACTION", error)
                    }
                case .pending:
                    call.reject("This purchase is pending approval.", "PURCHASE_PENDING")
                case .userCancelled:
                    call.reject("Purchase cancelled.", "PURCHASE_CANCELLED")
                @unknown default:
                    call.reject("The App Store returned an unknown purchase result.", "UNKNOWN_PURCHASE_RESULT")
                }
            } catch {
                call.reject("The App Store purchase could not be completed.", "PURCHASE_FAILED", error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var restored: [[String: String]] = []

                for await result in Transaction.currentEntitlements {
                    guard case .verified(let transaction) = result,
                          productPlans[transaction.productID] != nil else {
                        continue
                    }
                    restored.append([
                        "transactionId": String(transaction.id),
                        "signedTransaction": result.jwsRepresentation,
                    ])
                }

                call.resolve(["transactions": restored])
            } catch {
                call.reject("App Store purchases could not be restored.", "RESTORE_FAILED", error)
            }
        }
    }

    @objc func recover(_ call: CAPPluginCall) {
        Task {
            var unfinished: [[String: String]] = []
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result,
                      productPlans[transaction.productID] != nil else {
                    continue
                }
                unfinished.append([
                    "transactionId": String(transaction.id),
                    "signedTransaction": result.jwsRepresentation,
                ])
            }
            call.resolve(["transactions": unfinished])
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let transactionIdValue = call.getString("transactionId"),
              let transactionId = UInt64(transactionIdValue) else {
            call.reject("A valid transaction is required.", "INVALID_TRANSACTION")
            return
        }

        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result, transaction.id == transactionId else {
                    continue
                }
                await transaction.finish()
                call.resolve()
                return
            }
            call.resolve()
        }
    }
}