import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw, QrCode, Keyboard } from 'lucide-react';
import { Button } from './Button';
import { cn } from './utils';

/**
 * Leitor de QR Code pela câmera.
 *
 * - Usa a câmera traseira em celulares (`facingMode: environment`).
 * - Aguarda 1,2s entre leituras para não disparar várias validações.
 * - Informa claramente quando a permissão é negada ou não há câmera, com
 *   fallback para digitação manual do código.
 * - Pausa a câmera durante o processamento, evitando chamadas duplicadas.
 */
export function QrScanner({
  onScan,
  paused = false,
  className,
}: {
  /** Chamado uma vez por leitura válida, com o texto do QR. */
  onScan: (code: string) => void;
  /** Quando verdadeiro, pausa a câmera (ex.: exibindo o resultado). */
  paused?: boolean;
  className?: string;
}) {
  const containerId = useRef(`qr-reader-${Math.random().toString(36).slice(2, 9)}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [restartKey, setRestartKey] = useState(0);

  const SCAN_COOLDOWN_MS = 1200;

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await scanner.stop();
      }
    } catch {
      // Ignora: a câmera já pode estar parada.
    }
    scannerRef.current = null;
  }, []);

  const startScanner = useCallback(async () => {
    setStatus('starting');
    setErrorMessage(null);

    try {
      await stopScanner();

      const scanner = new Html5Qrcode(containerId.current, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const min = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(min * 0.72);
            return { width: size, height: size };
          },
          aspectRatio: 1,
        },
        (decodedText) => {
          const now = Date.now();
          const previous = lastScanRef.current;

          // Ignora leituras repetidas do mesmo código em sequência.
          if (previous.code === decodedText && now - previous.at < SCAN_COOLDOWN_MS) return;

          lastScanRef.current = { code: decodedText, at: now };
          onScan(decodedText.trim());
        },
        () => {
          // Falha de leitura de um frame — normal enquanto o QR não está no foco.
        },
      );

      setStatus('running');
    } catch (error) {
      setStatus('error');
      const message = error instanceof Error ? error.message : String(error);

      if (/permission|denied|notallowed/i.test(message)) {
        setErrorMessage(
          'Permissão de câmera negada. Autorize o acesso à câmera nas configurações do navegador ou use o código manual.',
        );
      } else if (/notfound|no camera|devices/i.test(message)) {
        setErrorMessage(
          'Nenhuma câmera encontrada neste dispositivo. Use a digitação manual do código.',
        );
      } else if (/https|secure/i.test(message)) {
        setErrorMessage('A câmera exige conexão segura (HTTPS). Use o código manual.');
      } else {
        setErrorMessage('Não foi possível iniciar a câmera. Use o código manual.');
      }
      setShowManual(true);
    }
  }, [onScan, stopScanner]);

  // Inicia/para o scanner conforme o estado `paused` e reinícios.
  useEffect(() => {
    void startScanner();
    return () => {
      void stopScanner();
    };
  }, [startScanner, stopScanner, restartKey]);

  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    const apply = async () => {
      try {
        const state = scanner.getState();
        if (paused && state === Html5QrcodeScannerState.SCANNING) {
          scanner.pause(true);
        } else if (!paused && state === Html5QrcodeScannerState.PAUSED) {
          await scanner.resume();
        }
      } catch {
        // Ignora transições inválidas de estado.
      }
    };

    void apply();
  }, [paused]);

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (code.length < 4) return;
    onScan(code);
    setManualCode('');
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Área da câmera */}
      <div className="relative overflow-hidden rounded-3xl bg-wedding-950">
        <div
          id={containerId.current}
          className={cn(
            'min-h-[280px] w-full sm:min-h-[340px]',
            '[&_video]:h-full [&_video]:w-full [&_video]:object-cover',
            '[&_img]:hidden',
          )}
        />

        {status !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-wedding-950/95 p-6 text-center text-white">
            {status === 'starting' ? (
              <>
                <Camera className="h-9 w-9 animate-pulse text-wedding-300" aria-hidden />
                <p className="text-sm text-wedding-300">Iniciando a câmera...</p>
              </>
            ) : (
              <>
                <CameraOff className="h-9 w-9 text-danger-400" aria-hidden />
                <p className="max-w-sm text-sm text-wedding-200">{errorMessage}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => setRestartKey((key) => key + 1)}
                >
                  Tentar novamente
                </Button>
              </>
            )}
          </div>
        )}

        {status === 'running' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[72%] w-[72%] rounded-2xl border-2 border-white/70" />
          </div>
        )}
      </div>

      {/* Alternar para digitação manual */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setShowManual((value) => !value)}
          className="inline-flex items-center gap-1.5 text-sm text-wedding-500 transition-colors hover:text-wedding-800"
        >
          {showManual ? <QrCode className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
          {showManual ? 'Usar a câmera' : 'Digitar o código manualmente'}
        </button>
      </div>

      {showManual && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value.toUpperCase())}
            placeholder="EX.: EVENT-8F72AB91-X92K"
            className="input font-mono uppercase"
            autoComplete="off"
            autoCapitalize="characters"
            aria-label="Código do convite"
          />
          <Button type="submit" disabled={manualCode.trim().length < 4}>
            Validar
          </Button>
        </form>
      )}
    </div>
  );
}
