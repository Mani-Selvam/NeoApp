import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    Alert,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    SkeletonCard,
    SkeletonCircle,
    SkeletonLine,
    SkeletonPulse,
    SkeletonSpacer,
} from "../components/skeleton/Skeleton";
import { verifyRazorpayPayment } from "../services/userService";

export default function RazorpayCheckoutScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const webViewRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);

    const {
        keyId,
        orderId,
        amountInrPaise,
        amountInr,
        planId,
        couponCode = "",
        adminCount = 0,
        staffCount = 0,
        displayCurrency = "INR",
        usdInrRate = 83,
        prefill = {},
        notes = {},
        theme = { color: "#0E5E6F" },
    } = route?.params || {};

    const onMessage = useCallback(
        async (msg) => {
            if (!msg || typeof msg !== "object") return;

            if (msg.type === "cancel") {
                navigation.goBack();
                return;
            }

            if (msg.type === "error") {
                Alert.alert(
                    "Payment Error",
                    msg.message || "Payment initialization failed",
                );
                navigation.goBack();
                return;
            }

            if (msg.type === "success") {
                if (verifying) return;
                try {
                    setVerifying(true);
                    const payload = msg.payload || {};
                    const res = await verifyRazorpayPayment({
                        planId,
                        couponCode,
                        adminCount,
                        staffCount,
                        razorpay_order_id: payload.razorpay_order_id,
                        razorpay_payment_id: payload.razorpay_payment_id,
                        razorpay_signature: payload.razorpay_signature,
                    });

                    navigation.navigate("PaymentSuccessScreen", {
                        planName:
                            res?.plan?.name || notes?.planName || "Selected",
                        finalPrice: res?.pricing?.finalPrice,
                        renewDate: res?.renewDate,
                        receipt: res?.receipt || null,
                        displayCurrency,
                        usdInrRate,
                    });
                } catch (e) {
                    Alert.alert(
                        "Payment Verification Failed",
                        e?.message || "Unable to verify payment",
                    );
                    navigation.goBack();
                } finally {
                    setVerifying(false);
                }
            }
        },
        [
            adminCount,
            couponCode,
            displayCurrency,
            navigation,
            notes?.planName,
            planId,
            staffCount,
            usdInrRate,
            verifying,
        ],
    );

    const html = useMemo(() => {
        const safeKeyId = String(keyId || "");
        const safeOrderId = String(orderId || "");
        const safeAmount = Number(amountInrPaise || 0);
        const safeName = String(prefill.name || "NeoApp");
        const safeEmail = String(prefill.email || "");
        const safeContact = String(prefill.contact || "");
        const safeTheme = String(theme.color || "#0E5E6F");
        const safeNotes = notes && typeof notes === "object" ? notes : {};
        const safeDesc = `Pay ₹${Number(amountInr || 0).toFixed(2)}`;

        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Razorpay Checkout</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial; margin:0; padding:18px; background:#f8fafc; }
      .card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:16px; }
      h1 { font-size:18px; margin:0 0 8px; }
      p { margin:0 0 12px; color:#475569; }
      button { width:100%; padding:12px 14px; border-radius:12px; border:0; background:${safeTheme}; color:#fff; font-weight:800; font-size:15px; }
      .small { margin-top:10px; font-size:12px; color:#64748b; text-align:center; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Secure Payment</h1>
      <p>${safeDesc}</p>
      <button id="payBtn">Pay Now</button>
      <div class="small">Powered by Razorpay</div>
    </div>
    <script>
      const post = (obj) => {
        try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
      };
      const options = {
        key: ${JSON.stringify(safeKeyId)},
        amount: ${JSON.stringify(safeAmount)},
        currency: "INR",
        name: ${JSON.stringify(safeName)},
        description: ${JSON.stringify("Plan purchase")},
        order_id: ${JSON.stringify(safeOrderId)},
        prefill: { name: ${JSON.stringify(safeName)}, email: ${JSON.stringify(safeEmail)}, contact: ${JSON.stringify(safeContact)} },
        notes: ${JSON.stringify(safeNotes)},
        theme: { color: ${JSON.stringify(safeTheme)} },
        handler: function (resp) {
          post({ type: "success", payload: resp });
        },
        modal: {
          ondismiss: function() { post({ type: "cancel" }); }
        }
      };
      document.getElementById("payBtn").addEventListener("click", function() {
        try { new Razorpay(options).open(); } catch (e) { post({ type: "error", message: String(e && e.message || e) }); }
      });
      // Auto-open
      setTimeout(() => {
        try { new Razorpay(options).open(); } catch (e) {}
      }, 350);
    </script>
  </body>
</html>`;
    }, [
        amountInr,
        amountInrPaise,
        keyId,
        notes,
        orderId,
        prefill.contact,
        prefill.email,
        prefill.name,
        theme.color,
    ]);

    return (
        <SafeAreaView
            style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={20} color="#182028" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment</Text>
                <View style={styles.headerSpacer} />
            </View>

            <View style={styles.webWrap}>
                <WebView
                    ref={webViewRef}
                    originWhitelist={["*"]}
                    source={{ html }}
                    onLoadEnd={() => setLoading(false)}
                    onMessage={(event) => {
                        const data = event?.nativeEvent?.data;
                        let msg = null;
                        try {
                            msg = JSON.parse(data);
                        } catch (_e) {
                            msg = null;
                        }
                        onMessage(msg);
                    }}
                />
                {loading || verifying ? (
                    <View style={styles.loadingOverlay}>
                        <SkeletonPulse>
                            <SkeletonCard
                                style={{
                                    width: 240,
                                    alignItems: "center",
                                    borderRadius: 22,
                                }}>
                                <SkeletonCircle size={40} />
                                <SkeletonSpacer h={14} />
                                <SkeletonLine width="72%" height={12} />
                            </SkeletonCard>
                        </SkeletonPulse>
                    </View>
                ) : null}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F3F1EA" },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingVertical: 12,
    },
    backButton: {
        width: 38,
        height: 38,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: { fontSize: 16, fontWeight: "900", color: "#182028" },
    headerSpacer: { width: 38 },
    webWrap: { flex: 1, borderTopWidth: 1, borderTopColor: "#E2DFD4" },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(243,241,234,0.65)",
        alignItems: "center",
        justifyContent: "center",
    },
});
