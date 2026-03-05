import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export function EditMyScheduleScreen({
  personalSets,
  screenshotCount,
  setScreenshotCount,
  loading,
  onImportPersonal,
  onRefreshPersonal,
  onSetAllMustSee,
  onSetPreference
}) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Update Your Schedule</Text>
        <Text style={styles.helper}>Upload more screenshots if your plans changed.</Text>
        <TextInput
          value={screenshotCount}
          onChangeText={setScreenshotCount}
          style={styles.input}
          keyboardType="number-pad"
          placeholder="Screenshot count"
        />
        <Pressable onPress={onImportPersonal} style={[styles.buttonPrimary, loading && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>Upload + Re-Parse</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable onPress={onRefreshPersonal} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
          <Pressable onPress={onSetAllMustSee} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>All Must-See</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Your Parsed Sets ({(personalSets || []).length})</Text>
        {(personalSets || []).length ? (
          (personalSets || []).map((setItem) => (
            <View key={setItem.canonical_set_id} style={styles.setCard}>
              <Text style={styles.title}>{setItem.artist_name}</Text>
              <Text style={styles.helper}>{setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} PT</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => onSetPreference(setItem.canonical_set_id, 'must_see')}
                  style={[styles.prefButton, setItem.preference === 'must_see' && styles.prefButtonActive]}
                >
                  <Text style={[styles.prefText, setItem.preference === 'must_see' && styles.prefTextActive]}>Must-See</Text>
                </Pressable>
                <Pressable
                  onPress={() => onSetPreference(setItem.canonical_set_id, 'flexible')}
                  style={[styles.prefButton, setItem.preference !== 'must_see' && styles.prefButtonActive]}
                >
                  <Text style={[styles.prefText, setItem.preference !== 'must_see' && styles.prefTextActive]}>Maybe</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.helper}>No personal sets loaded yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8d8c1',
    padding: 12,
    gap: 8
  },
  label: { fontWeight: '700', color: '#303030' },
  helper: { color: '#666', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffdf9'
  },
  row: { flexDirection: 'row', gap: 8 },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  setCard: {
    borderWidth: 1,
    borderColor: '#e5d8c6',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fffdf9',
    gap: 4
  },
  title: { color: '#2f2f2f', fontWeight: '700' },
  prefButton: {
    borderWidth: 1,
    borderColor: '#cab697',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbf6ee'
  },
  prefButtonActive: {
    backgroundColor: '#e4f2e7',
    borderColor: '#6a9e73'
  },
  prefText: {
    color: '#4a4a4a',
    fontSize: 12,
    fontWeight: '700'
  },
  prefTextActive: { color: '#235232' }
});
