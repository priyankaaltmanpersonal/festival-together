import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EditableSetCard } from '../components/EditableSetCard';

function AddArtistCard({ onAdd, onCancel, defaultDayIndex }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim() || !start.trim() || !end.trim()) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: start.trim(),
        end_time_pt: end.trim(),
        day_index: defaultDayIndex || 1,
      });
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.addCard}>
      <Text style={styles.addCardLabel}>Add Artist</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Artist name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Bad Bunny" />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Stage</Text>
        <TextInput value={stage} onChangeText={setStage} style={styles.input} placeholder="e.g. Coachella Stage" />
      </View>
      <View style={styles.timeRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
          <TextInput value={start} onChangeText={setStart} style={styles.input} placeholder="21:00" />
        </View>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>End (HH:MM)</Text>
          <TextInput value={end} onChangeText={setEnd} style={styles.input} placeholder="23:00" />
        </View>
      </View>
      <View style={styles.saveRow}>
        {saving ? (
          <ActivityIndicator color="#183a27" />
        ) : (
          <Pressable onPress={handleAdd} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.saveError}>{error}</Text> : null}
    </View>
  );
}

export function EditMyScheduleScreen({
  personalSets,
  screenshotCount,
  setScreenshotCount,
  loading,
  onImportPersonal,
  onRefreshPersonal,
  onSetAllMustSee,
  onSetPreference,
  onDeleteSet,
  onAddSet,
  onEditSet,
}) {
  const [editingSetId, setEditingSetId] = useState(null);
  const [savingSetId, setSavingSetId] = useState(null);
  const [deletingSetIds, setDeletingSetIds] = useState(new Set());
  const [isAddingNew, setIsAddingNew] = useState(false);

  const handleSave = async (canonicalSetId, fields) => {
    setSavingSetId(canonicalSetId);
    try {
      await onEditSet(canonicalSetId, fields);
      setEditingSetId(null);
    } finally {
      setSavingSetId(null);
    }
  };

  const handleDelete = async (canonicalSetId) => {
    setDeletingSetIds((prev) => new Set([...prev, canonicalSetId]));
    await onDeleteSet(canonicalSetId);
    setDeletingSetIds((prev) => {
      const next = new Set(prev);
      next.delete(canonicalSetId);
      return next;
    });
  };

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
            <EditableSetCard
              key={setItem.canonical_set_id}
              setItem={setItem}
              isEditing={editingSetId === setItem.canonical_set_id}
              onStartEdit={() => setEditingSetId(setItem.canonical_set_id)}
              onCancelEdit={() => setEditingSetId(null)}
              onSave={(fields) => handleSave(setItem.canonical_set_id, fields)}
              onDelete={() => handleDelete(setItem.canonical_set_id)}
              onSetPreference={onSetPreference}
              saving={savingSetId === setItem.canonical_set_id}
              deleting={deletingSetIds.has(setItem.canonical_set_id)}
            />
          ))
        ) : (
          <Text style={styles.helper}>No personal sets loaded yet.</Text>
        )}

        {isAddingNew ? (
          <AddArtistCard
            onAdd={onAddSet}
            onCancel={() => setIsAddingNew(false)}
            defaultDayIndex={1}
          />
        ) : (
          <Pressable onPress={() => setIsAddingNew(true)} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add Artist</Text>
          </Pressable>
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
    gap: 8,
  },
  label: { fontWeight: '700', color: '#303030' },
  helper: { color: '#666', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffdf9',
  },
  row: { flexDirection: 'row', gap: 8 },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  addButton: {
    borderWidth: 1,
    borderColor: '#6a9e73',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f0f7f3',
  },
  addButtonText: { color: '#345a46', fontWeight: '700', fontSize: 13 },
  addCard: {
    borderWidth: 1,
    borderColor: '#6a9e73',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fdf8',
    gap: 8,
  },
  addCardLabel: { fontWeight: '700', color: '#2d6a4a', fontSize: 13 },
  fieldGroup: { gap: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#5a4d3b' },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#183a27',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#666', fontWeight: '700', fontSize: 13 },
  saveError: { color: '#b52424', fontWeight: '600', fontSize: 12 },
});
