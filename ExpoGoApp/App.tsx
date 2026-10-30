import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Sharing from 'expo-sharing';
import Transfer, { TransferState } from './src/transfer';

const C = { bg: '#101827', card: '#1C293B', line: '#344258', muted: '#A9B9CD', text: '#F6F8FD', yellow: '#FFD45A', green: '#80D9B3', blue: '#9BC4FF' };
function Button({ title, onPress, secondary = false, danger = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, danger && s.danger, (disabled || pressed) && { opacity: disabled ? .4 : .7 }]}>
    <Text style={[s.buttonText, secondary && { color: C.text }, danger && { color: '#FFC3B2' }]}>{title}</Text>
  </Pressable>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
function Home() {
  const [state, setState] = useState<TransferState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanner, setScanner] = useState(false);
  const [manual, setManual] = useState(false);
  const [link, setLink] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLocked = useRef(false);
  const busyRef = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (!Transfer) return;
    const next = await Transfer.getState();
    if (alive.current) setState(next);
  }, []);
  const act = useCallback(async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (e) { if (alive.current) setError(errorText(e)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }, [refresh]);
  const pair = useCallback(async (qr: string) => {
    if (!Transfer || busyRef.current || scanLocked.current) return;
    if (stateRef.current?.running || stateRef.current?.preparing) { setError('Pausa la importación antes de cambiar de conexión.'); return; }
    scanLocked.current = true; setScanner(false); setManual(false);
    try {
      const server = await Transfer.previewPairing(qr);
      Alert.alert('Enlazar con tu MiniTV', 'Tus fotos se enviarán a:\n\n' + server + '\n\nComprueba que es la dirección del dashboard.', [
        { text: 'Cancelar', style: 'cancel', onPress: () => { scanLocked.current = false; } },
        { text: 'Enlazar', onPress: () => { scanLocked.current = false; void act(async () => { await Transfer!.connect(qr); setLink(''); }); } }
      ], { cancelable: false });
    } catch (e) { scanLocked.current = false; setError(errorText(e)); }
  }, [act]);
  useEffect(() => {
    alive.current = true;
    let polling = false;
    const poll = async () => {
      if (polling || AppState.currentState !== 'active') return;
      polling = true;
      try { await refresh(); } catch (e) { if (alive.current) setError(errorText(e)); }
      finally { polling = false; }
    };
    void poll();
    const timer = setInterval(poll, 1000);
    const app = AppState.addEventListener('change', status => { if (status === 'active') void poll(); else if (status === 'background') Transfer.pauseIfRunning(); });
    const links = Linking.addEventListener('url', ({ url }) => { if (url.startsWith('minitvphotos:')) void pair(url); });
    Linking.getInitialURL().then(url => { if (url?.startsWith('minitvphotos:')) void pair(url); }).catch(e => setError(errorText(e)));
    return () => { alive.current = false; clearInterval(timer); app.remove(); links.remove(); };
  }, [pair, refresh]);
  const openScanner = () => void act(async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) throw new Error('Permite la cámara en Ajustes o pega el enlace del QR.');
    scanLocked.current = false; setScanner(true);
  });
  const prepare = (selected = false) => {
    const execute = () => void act(async () => { await Transfer!.prepare(selected); });
    if (state?.hasJob) Alert.alert('Nueva revisión de la fototeca', 'Se sustituirá el informe anterior por una nueva revisión de todas las fotos autorizadas. Las que ya están en la web se reconocerán como existentes.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Revisar y subir', onPress: execute }
    ]); else execute();
  };
  // Interruption must stay available while prepare() is waiting for Photos/iCloud.
  const interrupt = async (intent: 'pause' | 'stop') => {
    setError('');
    try {
      const action = intent === 'stop' ? Transfer.stop() : Transfer.pause();
      void refresh().catch(() => {});
      await action; await refresh();
    } catch (e) { if (alive.current) setError(errorText(e)); }
  };
  const disabled = busy || !!state?.preparing || !!state?.interruption;
  const percent = Math.round((state?.percentage ?? 0) * 100);
  const done = (state?.imported ?? 0) + (state?.existing ?? 0) + (state?.failed ?? 0);
  return <SafeAreaView style={s.safe}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <View style={s.logo}><View style={s.logoScreen} /><View style={s.logoDot} /></View>
        <View style={{ flex: 1 }}><Text style={s.brand}>MiniTV <Text style={{ color: C.yellow }}>Fotos</Text></Text><Text style={s.kicker}>DEL MÓVIL A TU BIBLIOTECA</Text></View>
        <View style={s.tag}><Text style={s.tagText}>EXPO GO</Text></View>
      </View>
      <Text style={s.title}>{'Tus recuerdos,\nen pantalla grande.'}</Text>
      <Text style={s.description}>Enlaza tu MiniTV y envía tus fotos por Wi-Fi. Los originales se quedan contigo.</Text>
      {Platform.OS === 'android' && <Text style={s.notice}>En Expo Go para Android, elige las fotos que quieres subir en el selector del sistema. Puedes importarlas por grupos.</Text>}
      <>
        <View style={s.card}>
          <View style={s.row}><Text style={s.cardTitle}>01 · Tu MiniTV</Text><Text style={[s.status, { color: state?.connected ? C.green : C.muted }]}>{state?.connected ? '● ENLAZADA' : '○ SIN ENLACE'}</Text></View>
          {state?.connected ? <Text selectable style={s.server}>{state.server}</Text> : <Text style={s.description}>Abre Dashboard → Subidas → Fotos en la web y escanea su QR.</Text>}
          <View style={s.actions}><View style={{ flex: 1 }}><Button title={state?.connected ? 'Cambiar enlace' : 'Escanear QR'} onPress={openScanner} disabled={disabled || state?.running} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Pegar enlace del QR" disabled={disabled || state?.running} onPress={() => setManual(true)} style={s.paste}><Text style={s.pasteText}>Pegar enlace</Text></Pressable></View>
        </View>
        <View style={s.card}>
          <View style={s.row}><Text style={s.cardTitle}>02 · Tu fototeca</Text>{(busy || state?.preparing) && <ActivityIndicator color={C.yellow} />}</View>
          <View style={s.progressHeader}><Text style={s.percent}>{percent}<Text style={s.percentSign}>%</Text></Text><Text style={s.count}>{done} de {state?.total ?? 0}{'\n'}fotos comprobadas</Text></View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={s.track}><View style={[s.fill, { width: (percent + '%') as '0%' }]} /></View>
          <View style={s.metrics}>
            {[[state?.imported ?? 0, 'Exportadas', C.green], [state?.existing ?? 0, 'Ya estaban', C.blue], [state?.failed ?? 0, 'Errores', C.yellow]].map(([count, label, color]) => <View key={label} style={s.metric}><Text style={[s.metricValue, { color: String(color) }]}>{count}</Text><Text style={s.metricLabel}>{label}</Text></View>)}
          </View>
          <Text accessibilityLiveRegion="polite" style={s.message}>{state?.message ?? 'Leyendo el progreso guardado…'}</Text>
          {!!state?.fileName && state.running && <Text numberOfLines={2} style={s.file}>{state.fileName}{state.fileProgress >= 0 ? ' · ' + Math.round(state.fileProgress * 100) + '%' : ''}</Text>}
          {state?.limited && <Text style={s.notice}>Acceso limitado: solo se exportarán las fotos que has autorizado. El porcentaje corresponde a estas fotos autorizadas.</Text>}
          {!state?.running && !state?.preparing && !state?.interruption && <>
            <Button title={Platform.OS === 'android' ? 'Elegir fotos y subir' : state?.hasJob ? 'Revisar y subir todas de nuevo' : 'Subir mis fotos'} secondary={!!state?.canResume} onPress={() => prepare()} disabled={disabled || !state?.connected} />
            {Platform.OS === 'ios' && <Button title="Elegir fotos" secondary onPress={() => prepare(true)} disabled={disabled || !state?.connected} />}
          </>}
          <Text style={s.small}>Exportadas cuenta las fotos nuevas confirmadas por tu MiniTV. Pausar guarda el progreso; Detener finaliza la exportación y conserva las fotos enviadas.</Text>
        </View>
      </>
      {!!(error || state?.error) && <View style={s.error}><Text selectable style={s.errorText}>{error || state?.error}</Text><Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}><Text style={s.settings}>Abrir ajustes</Text></Pressable></View>}
      <View style={s.background}><Text style={s.backgroundTitle}>MANTÉN EXPO GO ABIERTO</Text><Text style={s.small}>{state?.backgroundNotice || 'Mantén esta pantalla abierta hasta completar la importación. Puedes pausar y continuar después.'}</Text></View>
      {!!state?.recent.length && <View style={s.card}><View style={s.row}><Text style={s.cardTitle}>Últimas fotos</Text><Text style={s.status}>{state.recent.length}</Text></View>{state.recent.map((entry, i) => <Text selectable key={i + '-' + entry} style={s.result}>{entry}</Text>)}<Button title="Compartir informe CSV" secondary disabled={busy} onPress={() => void act(async () => {
        if (!(await Sharing.isAvailableAsync())) throw new Error('No se puede compartir el informe desde este dispositivo.');
        await Sharing.shareAsync(await Transfer!.report(), { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Informe de MiniTV Fotos' });
      })} /></View>}
      <Text style={s.footer}>{'Sin borrar originales · Sin duplicar fotos\nAndroid + iOS · MiniTV Fotos'}</Text>
    </ScrollView>
    {(state?.hasJob || state?.canPause || state?.interruption) && <View style={s.transferDock}>
      <View style={s.dockContent}>
        <View style={s.row}>
          <Text accessibilityLiveRegion="polite" style={s.exportedCount}>{state.imported}<Text style={s.exportedLabel}> fotos exportadas</Text></Text>
          <Text style={s.count}>{done} de {state.total}{'\n'}comprobadas · {percent}%</Text>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel="Fotos comprobadas" accessibilityValue={{ min: 0, max: state.total || 1, now: done }} style={s.track}><View style={[s.fill, { width: (percent + '%') as '0%' }]} /></View>
        <Text accessibilityLiveRegion="polite" style={s.dockStatus}>{state.interruption === 'stop' ? 'Deteniendo… Guardando el resumen.' : state.interruption === 'pause' ? 'Pausando… Guardando el progreso.' : state.preparing ? 'Leyendo las fotos autorizadas…' : state.running ? 'Exportación en curso' : state.stopped ? 'Detenida · Tus fotos enviadas se conservan' : state.canResume ? 'Pausada · Puedes continuar cuando quieras' : 'Exportación terminada'}</Text>
        {(state.canPause || state.canResume || state.canStop || state.interruption) && <View style={s.dockActions}>
          <View style={{ flex: 1 }}>{state.canResume ? <Button title="Continuar subida" onPress={() => void act(() => Transfer.start())} disabled={disabled || !state.connected} /> : <Button title={state.interruption === 'pause' ? 'Pausando…' : 'Pausar'} secondary onPress={() => void interrupt('pause')} disabled={!state.canPause} />}</View>
          <View style={{ flex: 1 }}><Button title={state.interruption === 'stop' ? 'Deteniendo…' : 'Detener'} danger onPress={() => void interrupt('stop')} disabled={!state.canStop} /></View>
        </View>}
      </View>
    </View>}
    <Modal visible={scanner} animationType="slide" onRequestClose={() => setScanner(false)}>
      <SafeAreaView style={s.safe}><View style={s.modalHeader}><Text style={s.cardTitle}>Escanea el QR de MiniTV</Text><Button title="Cerrar" secondary onPress={() => setScanner(false)} /></View>
        {scanner && cameraPermission?.granted && <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { void pair(data); }} />}
        <Text style={[s.description, { padding: 24 }]}>El QR está en Dashboard → Subidas → Fotos. El móvil y la MiniTV deben estar en la misma red.</Text>
      </SafeAreaView>
    </Modal>
    <Modal visible={manual} transparent animationType="fade" onRequestClose={() => setManual(false)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.scrim}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}><View style={s.dialog}><Text style={s.cardTitle}>Pega el enlace del QR</Text><Text style={s.description}>El enlace empieza por minitvphotos://pair.</Text><TextInput accessibilityLabel="Enlace de MiniTV" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} multiline style={s.input} placeholder="minitvphotos://pair?…" placeholderTextColor={C.muted} /><Button title="Comprobar enlace" disabled={!link.trim()} onPress={() => { void pair(link.trim()); }} /><Button title="Cancelar" secondary onPress={() => setManual(false)} /></View></ScrollView></KeyboardAvoidingView></Modal>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Home /></SafeAreaProvider>; }
const s = StyleSheet.create({
  transferDock: { backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 22, paddingVertical: 14 },
  dockContent: { width: '100%', maxWidth: 636, alignSelf: 'center', gap: 10 }, dockActions: { flexDirection: 'row', gap: 12 },
  exportedCount: { color: C.green, fontSize: 27, fontWeight: '800', flex: 1 }, exportedLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  dockStatus: { color: C.muted, fontSize: 12, lineHeight: 17 }, danger: { backgroundColor: '#422B30', borderColor: '#855057', borderWidth: 1 },
  safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 22, gap: 18, maxWidth: 680, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }, logo: { borderWidth: 2, borderColor: C.yellow, borderRadius: 10, width: 44, height: 35, flexDirection: 'row', alignItems: 'center', padding: 5, gap: 4 }, logoScreen: { flex: 1, height: 20, borderRadius: 4, borderWidth: 1, borderColor: C.yellow }, logoDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.yellow }, brand: { color: C.text, fontSize: 21, fontWeight: '800' }, kicker: { color: C.muted, fontSize: 8, letterSpacing: 1.4, marginTop: 4 }, tag: { paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: C.line, borderRadius: 7 }, tagText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: C.muted },
  title: { fontSize: 32, lineHeight: 37, letterSpacing: -.8, color: C.text, fontWeight: '800' }, description: { color: C.muted, fontSize: 14, lineHeight: 21 }, card: { padding: 20, gap: 15, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: '#29374A' }, cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, status: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: .7 }, server: { color: C.green, fontSize: 15 }, actions: { flexDirection: 'row', gap: 14, alignItems: 'center' }, paste: { paddingVertical: 12 }, pasteText: { color: C.muted, fontWeight: '600', fontSize: 12 }, button: { padding: 15, backgroundColor: C.yellow, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 }, buttonText: { color: C.bg, fontWeight: '800', fontSize: 14, textAlign: 'center' }, secondary: { borderWidth: 1, borderColor: C.line, backgroundColor: '#223147' },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, percent: { fontSize: 56, fontWeight: '800', color: C.text, letterSpacing: -2 }, percentSign: { fontSize: 25, color: C.yellow }, count: { color: C.muted, textAlign: 'right', fontSize: 12, lineHeight: 18 }, track: { height: 8, backgroundColor: '#101827', borderRadius: 8, overflow: 'hidden' }, fill: { height: 8, backgroundColor: C.yellow, borderRadius: 8 }, metrics: { flexDirection: 'row', paddingVertical: 8 }, metric: { flex: 1, alignItems: 'center' }, metricValue: { fontSize: 26, fontWeight: '800' }, metricLabel: { color: C.muted, fontSize: 11, marginTop: 3 }, message: { color: C.text, fontSize: 13, lineHeight: 19 }, file: { color: C.muted, fontSize: 11 }, notice: { color: C.yellow, fontSize: 12, lineHeight: 18 }, background: { paddingHorizontal: 5, gap: 8 }, backgroundTitle: { fontSize: 10, letterSpacing: 1.4, color: C.green, fontWeight: '800' }, small: { color: C.muted, fontSize: 12, lineHeight: 19 }, footer: { textAlign: 'center', color: '#8193AA', fontSize: 11, lineHeight: 20, paddingVertical: 6 }, result: { color: C.text, fontSize: 12, lineHeight: 19, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }, error: { padding: 16, gap: 12, borderRadius: 14, backgroundColor: '#422B30' }, errorText: { color: '#FFC3B2', fontSize: 13, lineHeight: 20 }, settings: { color: C.yellow, fontWeight: '600', fontSize: 13 }, modalHeader: { padding: 20, gap: 16 }, scrim: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 22 }, dialog: { backgroundColor: C.card, borderRadius: 22, padding: 22, gap: 16 }, input: { minHeight: 100, maxHeight: 180, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, color: C.text, textAlignVertical: 'top' }
});
