import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { submitEnterpriseContact } from "../services/userService";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EnterpriseContactScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const plan = route?.params?.plan;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    requirements: "",
  });

  const onSubmit = async () => {
    try {
      setLoading(true);
      await submitEnterpriseContact({
        ...form,
        planName: plan?.name || "Enterprise",
      });
      Alert.alert("Submitted", "Enterprise team will contact you soon.", [
        { text: "OK", onPress: () => navigation.navigate("Main", { screen: "Home" }) },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.title}>Enterprise Contact</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.plan}>Selected: {plan?.name || "Enterprise"}</Text>
          <Text style={styles.desc}>
            Enterprise plans use contact flow only. No coupon and no direct payment here.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Your Name"
            value={form.name}
            onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={form.email}
            onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone"
            value={form.phone}
            onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Company Name"
            value={form.company}
            onChangeText={(v) => setForm((p) => ({ ...p, company: v }))}
          />
          <TextInput
            style={[styles.input, { minHeight: 90 }]}
            placeholder="Requirements"
            value={form.requirements}
            onChangeText={(v) => setForm((p) => ({ ...p, requirements: v }))}
            multiline
          />
          <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>Submit Contact Request</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  content: { padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 10,
  },
  plan: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  desc: { fontSize: 13, color: "#64748B", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  btn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
