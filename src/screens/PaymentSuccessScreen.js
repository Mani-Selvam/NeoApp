import React, { useEffect } from "react";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";

export default function PaymentSuccessScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { refreshBillingPlan } = useAuth();
  const planName = route?.params?.planName || "Selected";
  const finalPrice = route?.params?.finalPrice;
  const renewDate = route?.params?.renewDate;
  const displayCurrency = route?.params?.displayCurrency || "INR";
  const usdInrRate = route?.params?.usdInrRate || 83;
  const symbol = String(displayCurrency).toUpperCase() === "USD" ? "$" : "₹";
  const formattedAmount = (() => {
    const usd = Number(finalPrice || 0);
    if (String(displayCurrency).toUpperCase() === "USD") return `${symbol}${usd.toFixed(2)}`;
    const rate = Number(usdInrRate || 0);
    const inr = Number.isFinite(rate) && rate > 0 ? usd * rate : usd;
    return `${symbol}${Math.round(inr).toLocaleString("en-IN")}`;
  })();

  useEffect(() => {
    refreshBillingPlan?.().catch(() => {});
  }, [refreshBillingPlan]);

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-done" size={56} color="#16A34A" />
        </View>
        <Text style={styles.title}>Payment Successful</Text>
        <Text style={styles.subtitle}>Your {planName} plan is now active.</Text>
        {typeof finalPrice === "number" ? (
          <Text style={styles.meta}>
            Amount Paid: {formattedAmount}
          </Text>
        ) : null}
        {renewDate ? (
          <Text style={styles.meta}>
            Renews on: {new Date(renewDate).toLocaleDateString()}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.btn}
          onPress={() => refreshBillingPlan?.().catch(() => {})}
        >
          <Text style={styles.btnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  iconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900", color: "#0F172A" },
  subtitle: { fontSize: 15, color: "#334155", textAlign: "center" },
  meta: { fontSize: 13, color: "#64748B" },
  btn: {
    marginTop: 10,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
