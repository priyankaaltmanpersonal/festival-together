import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  // Extended hours (24-29) = next-day early morning
  if (h >= 24) h -= 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${ampm}`;
}

export function SetupScreen({
  userRole,
  onboardingStep,
  displayName,
  setDisplayName,
  groupName,
  setGroupName,
  inviteCodeInput,
  setInviteCodeInput,
  inviteCode,
  selectedChipColor,
  setSelectedChipColor,
  chipColorOptions,
  availableJoinColors,
  festivalDays,
  setFestivalDayLabel,
  onAddFestivalDay,
  onRemoveFestivalDay,
  loading,
  error,
  log,
  onBeginProfile,
  onCompleteFestivalSetup,
  onResetFlow,
  onChoosePath,
  onChooseDayScreenshot,
  onSkipDay,
  onAdvanceDay,
  onFinishUploadFlow,
  onSetDayPreference,
  onReuploadDay,
  onGoBackDay,
  uploadDayIndex,
  dayUploadStatus,
  dayParsedSets,
  successfulUploadCount,
}) {
  const isWelcome = onboardingStep === 'welcome';

  return (
    <ScrollView contentContainerStyle={[styles.wrap, isWelcome && styles.wrapWelcome]}>
      {isWelcome ? (
        <View style={styles.welcomeScreen}>
          <View style={styles.card}>
            <Text style={styles.kicker}>Welcome</Text>
            <Text style={styles.h1}>Plan your festival day with your crew</Text>
          </View>
          <View style={styles.welcomeActions}>
            <ActionButton
              label="Create a Group"
              onPress={() => onChoosePath('founder')}
              primary
              disabled={loading}
              large
            />
            <ActionButton label="Join a Group" onPress={() => onChoosePath('member')} disabled={loading} large />
          </View>
        </View>
      ) : null}

      {onboardingStep === 'profile_create' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={() => onChoosePath('welcome')} disabled={loading} />
          <Text style={styles.stepTitle}>Create Group</Text>
          <Text style={styles.inputLabel}>Your name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Your name" maxLength={60} />
          <Text style={styles.inputLabel}>Group name</Text>
          <TextInput value={groupName} onChangeText={setGroupName} style={styles.input} placeholder="Group name" maxLength={100} />
          <ColorPicker
            options={chipColorOptions}
            selected={selectedChipColor}
            onSelect={setSelectedChipColor}
          />
          <ActionButton label="Continue" onPress={onBeginProfile} primary disabled={loading || !selectedChipColor} />
        </View>
      ) : null}

      {onboardingStep === 'profile_join' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={() => onChoosePath('welcome')} disabled={loading} />
          <Text style={styles.stepTitle}>Join Group</Text>
          <Text style={styles.inputLabel}>Your name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Your name" maxLength={60} />
          <Text style={styles.inputLabel}>Invite code</Text>
          <TextInput
            value={inviteCodeInput}
            onChangeText={setInviteCodeInput}
            style={styles.input}
            autoCapitalize="characters"
            placeholder="Invite code"
          />
          <ColorPicker
            options={chipColorOptions}
            selected={selectedChipColor}
            onSelect={setSelectedChipColor}
            availableSet={new Set(availableJoinColors || [])}
          />
          <ActionButton label="Continue" onPress={onBeginProfile} primary disabled={loading || !selectedChipColor} />
        </View>
      ) : null}

      {onboardingStep === 'festival_setup' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={() => onChoosePath('founder')} disabled={loading} />
          <Text style={styles.stepTitle}>Festival Days</Text>
          <Text style={styles.helper}>Add each day of the festival you're attending.</Text>
          {(festivalDays || []).map((day, index) => (
            <View key={day.dayIndex} style={styles.dayRow}>
              <Text style={styles.dayIndexLabel}>Day {index + 1}</Text>
              <TextInput
                value={day.label}
                onChangeText={(text) => setFestivalDayLabel(day.dayIndex, text)}
                style={[styles.input, styles.dayInput]}
                placeholder={index === 0 ? 'e.g. Friday' : index === 1 ? 'e.g. Saturday' : 'e.g. Sunday'}
                maxLength={20}
              />
              <Pressable
                onPress={() => onRemoveFestivalDay(day.dayIndex)}
                disabled={(festivalDays || []).length <= 1}
                style={[styles.removeButton, (festivalDays || []).length <= 1 && styles.removeButtonDisabled]}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          ))}
          <ActionButton label="＋ Add Day" onPress={onAddFestivalDay} disabled={loading} />
          <ActionButton label="Continue" onPress={onCompleteFestivalSetup} primary disabled={loading} />
        </View>
      ) : null}

      {onboardingStep === 'upload_day' ? (() => {
        const totalDays = (festivalDays || []).length;
        const dayPosition = (festivalDays || []).findIndex((d) => d.dayIndex === uploadDayIndex) + 1;
        const currentDay = (festivalDays || []).find((d) => d.dayIndex === uploadDayIndex);
        const dayLabel = currentDay?.label || `Day ${uploadDayIndex}`;
        const truncatedLabel = dayLabel.length > 15 ? dayLabel.slice(0, 15) + '…' : dayLabel;
        const isLastDay = dayPosition === totalDays;
        const canFinish = successfulUploadCount >= 1 || dayUploadStatus === 'done';

        return (
          <View style={styles.stepCard}>
            <View style={styles.skipRow}>
              {dayPosition > 1 || userRole === 'founder' ? (
                <Pressable onPress={onGoBackDay}>
                  <Text style={styles.skipLink}>← Back</Text>
                </Pressable>
              ) : <View />}
              <Pressable onPress={onSkipDay}>
                <Text style={styles.skipLink}>Skip this day →</Text>
              </Pressable>
            </View>

            <Text style={styles.stepTitle}>Upload {truncatedLabel} schedule</Text>
            <Text style={styles.helper}>Day {dayPosition} of {totalDays}</Text>

            {dayUploadStatus === 'idle' || dayUploadStatus === 'error' ? (
              <ActionButton
                label="Choose Screenshot"
                onPress={onChooseDayScreenshot}
                primary
                disabled={loading}
              />
            ) : null}

            {dayUploadStatus === 'uploading' ? (
              <View style={styles.uploadingBlock}>
                <View style={styles.uploadingRow}>
                  <ActivityIndicator color="#183a27" />
                  <Text style={styles.helper}>Processing…</Text>
                </View>
                <Text style={styles.uploadingHint}>Analyzing your schedule, usually takes 5–10 seconds…</Text>
              </View>
            ) : null}

            {error ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}

            {dayUploadStatus === 'done' ? (
              <>
                <View style={styles.parsedHeader}>
                  <Text style={styles.parsedCount}>✓ {dayParsedSets.length} artists found</Text>
                  <Pressable onPress={onReuploadDay}>
                    <Text style={styles.skipLink}>Re-upload ↺</Text>
                  </Pressable>
                </View>
                {(dayParsedSets || []).map((setItem) => (
                  <View key={setItem.canonical_set_id} style={styles.setRow}>
                    <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                    <Text style={styles.helper}>
                      {setItem.stage_name} · {setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt
                        ? `${formatTime(setItem.start_time_pt)}–${formatTime(setItem.end_time_pt)}`
                        : formatTime(setItem.start_time_pt)}
                    </Text>
                    <View style={styles.prefRow}>
                      <PrefButton
                        label="Must See"
                        selected={setItem.preference === 'must_see'}
                        onPress={() => onSetDayPreference(setItem.canonical_set_id, 'must_see')}
                      />
                      <PrefButton
                        label="Maybe"
                        selected={setItem.preference !== 'must_see'}
                        onPress={() => onSetDayPreference(setItem.canonical_set_id, 'flexible')}
                      />
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {/* Action button: Next Day, Finish, or nothing */}
            {isLastDay ? (
              <ActionButton
                label="Finish →"
                onPress={() => onFinishUploadFlow(dayUploadStatus === 'done')}
                primary
                disabled={loading || dayUploadStatus === 'uploading' || !canFinish}
              />
            ) : dayUploadStatus === 'done' ? (
              <ActionButton
                label="Next Day →"
                onPress={() => onAdvanceDay(true)}
                primary
                disabled={loading}
              />
            ) : null}
          </View>
        );
      })() : null}


      {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      {error && onboardingStep !== 'upload_day' ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function ActionButton({ label, onPress, primary = false, disabled = false, large = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        large && styles.buttonLarge,
        disabled && styles.buttonDisabled
      ]}
    >
      <Text style={[styles.buttonText, large && styles.buttonTextLarge]}>{label}</Text>
    </Pressable>
  );
}

function PrefButton({ label, selected, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.prefButton, selected && styles.prefButtonSelected]}>
      <Text style={[styles.prefButtonText, selected && styles.prefButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ColorPicker({ options, selected, onSelect, availableSet = null }) {
  const all = options || [];
  const rows = [all.slice(0, 9), all.slice(9, 18)];
  return (
    <View style={styles.colorBlock}>
      <Text style={styles.label}>Pick your color</Text>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.colorRow}>
          {row.map((color) => {
            const enabled = !availableSet || availableSet.size === 0 || availableSet.has(color);
            return (
              <Pressable
                key={color}
                disabled={!enabled}
                onPress={() => onSelect(color)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color, borderColor: selected === color ? '#1f3024' : '#d2c5b3' },
                  selected === color && styles.colorSwatchSelected,
                  !enabled && styles.colorSwatchDisabled
                ]}
              />
            );
          })}
        </View>
      ))}
      {availableSet && availableSet.size > 0 ? (
        <Text style={styles.helper}>Unavailable colors are dimmed if already taken in that group.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 24 },
  wrapWelcome: { paddingTop: 20 },
  welcomeScreen: { gap: 20 },
  welcomeActions: { gap: 12 },
  card: {
    backgroundColor: '#fffdf8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5d7c3',
    padding: 12,
    gap: 8
  },
  stepCard: {
    backgroundColor: '#fffefb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7c9b4',
    padding: 12,
    gap: 8
  },
  kicker: { color: '#7a684f', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  h1: { color: '#1f3024', fontSize: 21, fontWeight: '800', lineHeight: 26 },
  label: { color: '#303030', fontWeight: '700' },
  stepTitle: { color: '#2f302f', fontWeight: '700', fontSize: 16 },
  inputLabel: { color: '#5a4d3b', fontSize: 12, fontWeight: '700', marginTop: 2 },
  helper: { color: '#666', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#d8c8b2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#fff'
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayIndexLabel: { color: '#5a4d3b', fontSize: 12, fontWeight: '700', width: 40 },
  dayInput: { flex: 1 },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonSecondary: {
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  buttonLarge: {
    minHeight: 66,
    justifyContent: 'center',
    borderRadius: 14
  },
  buttonTextLarge: { fontSize: 20, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  setRow: {
    borderWidth: 1,
    borderColor: '#e4d6c3',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fffdfa',
    gap: 4
  },
  setTitle: { color: '#2f2f2f', fontWeight: '700', fontSize: 13 },
  prefRow: { flexDirection: 'row', gap: 6 },
  prefButton: {
    borderWidth: 1,
    borderColor: '#cab697',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbf6ee'
  },
  prefButtonSelected: { borderColor: '#2f6244', backgroundColor: '#e6f2e8' },
  prefButtonText: { color: '#4e4e4e', fontSize: 12, fontWeight: '700' },
  prefButtonTextSelected: { color: '#214731' },
  colorBlock: { gap: 8, marginTop: 2 },
  colorRow: { flexDirection: 'row', justifyContent: 'space-between' },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.08 }]
  },
  colorSwatchDisabled: {
    opacity: 0.25
  },
  removeButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#e8ddd0', alignItems: 'center', justifyContent: 'center'
  },
  removeButtonDisabled: { opacity: 0.3 },
  removeButtonText: { fontSize: 18, color: '#5a4d3b', fontWeight: '700', lineHeight: 20 },
  error: { color: '#b52424', fontWeight: '600' },
  logLine: { color: '#444', fontSize: 11 },
  skipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  parsedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipLink: { color: '#345a46', fontWeight: '600', fontSize: 13 },
  uploadingBlock: { gap: 4 },
  uploadingRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  uploadingHint: { color: '#666', fontSize: 11, fontStyle: 'italic' },
  parsedCount: { color: '#2d6a4a', fontWeight: '700', fontSize: 14 },
});
