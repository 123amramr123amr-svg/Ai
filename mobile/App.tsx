import { useState } from "react";
import { View, Text, TextInput, Button, FlatList, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);

  async function run() {
    if (!prompt.trim()) return;
    const next = [prompt, ...tasks];
    setTasks(next);
    await AsyncStorage.setItem("tasks", JSON.stringify(next));
    setPrompt("");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Manus Clone (Free, Offline)</Text>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="What can I do for you?"
        style={styles.input}
      />
      <Button title="Run (local)" onPress={run} />
      <FlatList
        data={tasks}
        keyExtractor={(i, idx) => idx.toString()}
        renderItem={({ item }) => <Text style={styles.task}>• {item}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: "#0a0a0a" },
  title: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  input: { backgroundColor: "#171717", color: "#fff", padding: 12, borderRadius: 8, marginBottom: 12 },
  task: { color: "#f5f5f5", marginTop: 8 },
});
