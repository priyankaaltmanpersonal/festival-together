import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EditableSetCard } from './EditableSetCard';
import { useTheme } from '../theme';

function AddArtistForm({ dayIndex, onAdd, onCancel, C, styles }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim() || !start.trim() || !end.trim()) {
      setFormError('All fields are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: start.trim(),
        end_time_pt: end.trim(),
      });
      onCancel();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
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
          <ActivityIndicator color={C.primary} />
        ) : (
          <Pressable onPress={handleAdd} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {formError ? <Text style={styles.saveError}>{formError}</Text> : null}
    </View>
  );
}

export function DayTabReview({
  festivalDays = [],
  dayStates = {},
  onRetry,
  onDeleteSet,
  onAddSet,
  onSetPreference,
  onEditSet,
  onReUpload,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [activeDay, setActiveDay] = useState(festivalDays[0]?.dayIndex ?? 1);
  const [editingSetId, setEditingSetId] = useState(null);
  const [savingSetId, setSavingSetId] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleTabPress = (dayIndex) => {
    setActiveDay(dayIndex);
    setEditingSetId(null);
    setIsAdding(false);
  };

  const handleSave = async (canonicalSetId, fields) => {
    if (!onEditSet) return;
    setSavingSetId(canonicalSetId);
    try {
      await onEditSet(canonicalSetId, fields);
      setEditingSetId(null);
    } catch (err) {
      throw err; // surfaced by EditableSetCard
    } finally {
      setSavingSetId(null);
    }
  };

  const current = dayStates[activeDay] || { status: 'idle', sets: [], retryCount: 0 };
  const sets = current.sets || [];

  return (
    <View>
      <View style={styles.tabBar}>
        {festivalDays.map((day) => {
          const state = dayStates[day.dayIndex] || { status: 'idle', sets: [] };
          const isActive = day.dayIndex === activeDay;
          return (
            <Pressable
              key={day.dayIndex}
              onPress={() => handleTabPress(day.dayIndex)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabActiveText]}>
                {day.label}
              </Text>
              {state.status === 'uploading' ? (
                <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 4 }} />
              ) : state.status === 'done' && (state.sets || []).length > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{(state.sets || []).length}</Text>
                </View>
              ) : state.status === 'failed' ? (
                <Text style={styles.tabErrorMark}>!</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.content}>
        {current.status === 'uploading' ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={C.primary} />
            <View>
              <Text style={styles.loadingText}>Analyzing your schedule…</Text>
              <Text style={styles.loadingHint}>This usually takes 5–10 seconds. Hang tight!</Text>
            </View>
          </View>
        ) : current.status === 'failed' ? (
          <View style={styles.failedBlock}>
            <Text style={styles.failedText}>
              {current.retryCount >= 3
                ? 'Could not parse this screenshot after 3 attempts.'
                : 'Could not parse this screenshot.'}
            </Text>
            {current.retryCount < 3 ? (
              <Pressable onPress={() => onRetry(activeDay)} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>
                  Retry Upload ({3 - current.retryCount} attempt{3 - current.retryCount !== 1 ? 's' : ''} left)
                </Text>
              </Pressable>
            ) : null}
            {isAdding ? (
              <AddArtistForm
                dayIndex={activeDay}
                onAdd={(fields) => onAddSet(fields, activeDay)}
                onCancel={() => setIsAdding(false)}
                C={C}
                styles={styles}
              />
            ) : (
              <Pressable onPress={() => setIsAdding(true)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>+ Add Manually</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {current.status === 'idle' ? (
              <Text style={styles.emptyText}>No screenshot uploaded for this day.</Text>
            ) : sets.length === 0 ? (
              <Text style={styles.emptyText}>No artists found — add manually below.</Text>
            ) : null}
            {sets.map((setItem) => (
              <EditableSetCard
                key={setItem.canonical_set_id}
                setItem={setItem}
                isEditing={editingSetId === setItem.canonical_set_id}
                onStartEdit={() => setEditingSetId(setItem.canonical_set_id)}
                onCancelEdit={() => setEditingSetId(null)}
                onSave={(fields) => handleSave(setItem.canonical_set_id, fields)}
                onDelete={() => onDeleteSet(setItem.canonical_set_id, activeDay)}
                onSetPreference={(canonicalSetId, pref) => onSetPreference(canonicalSetId, pref, activeDay)}
                saving={savingSetId === setItem.canonical_set_id}
                deleting={false}
              />
            ))}
            {isAdding ? (
              <AddArtistForm
                dayIndex={activeDay}
                onAdd={(fields) => onAddSet(fields, activeDay)}
                onCancel={() => setIsAdding(false)}
                C={C}
                styles={styles}
              />
            ) : (
              <Pressable onPress={() => setIsAdding(true)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>+ Add Artist</Text>
              </Pressable>
            )}
            {onReUpload ? (
              <Pressable onPress={() => onReUpload(activeDay)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Re-upload Screenshot</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.tabBorder,
    backgroundColor: C.tabBg,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.tabActiveBorder,
    backgroundColor: C.tabActiveBg,
  },
  tabText: { color: C.tabText, fontWeight: '600', fontSize: 13 },
  tabActiveText: { color: C.tabActiveText },
  badge: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: { color: C.primaryText, fontSize: 10, fontWeight: '700' },
  tabErrorMark: { color: C.error, fontWeight: '800', fontSize: 13 },
  content: { gap: 8 },
  loadingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  loadingText: { color: C.textMuted, fontSize: 13 },
  loadingHint: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  failedBlock: { gap: 10 },
  failedText: { color: C.error, fontSize: 13 },
  emptyText: { color: C.textMuted, fontSize: 13 },
  primaryBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: C.btnSecondaryBg,
  },
  secondaryBtnText: { color: C.btnSecondaryText, fontWeight: '600', fontSize: 13 },
  addCard: {
    backgroundColor: C.addCardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.addCardBorder,
    padding: 12,
    gap: 8,
  },
  addCardLabel: { fontWeight: '700', color: C.addCardLabel, fontSize: 13 },
  fieldGroup: { gap: 3 },
  fieldLabel: { color: C.fieldLabelText, fontSize: 11, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 13,
    backgroundColor: C.inputBg,
    color: C.text,
  },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  saveError: { color: C.error, fontWeight: '600', fontSize: 12 },
});
