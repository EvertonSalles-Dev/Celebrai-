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
            {/* Moldura com cantos — guia visual para enquadrar o QR Code. */}
            <div className="relative h-[72%] w-[72%]">
              <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
              <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-white" />
              <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-white" />
              <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
              <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-white" />
              <span className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-gold-400/80 shadow-[0_0_12px_rgba(193,154,107,0.9)]" />
            </div>
          </div>
        )}

        {/* Colunas de estado sobre a câmera */}
        {status === 'running' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-400" aria-hidden />
              Leitura ativa
            </span>
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
        <form
          onSubmit={handleManualSubmit}
          className="space-y-3 rounded-2xl border-wedding-100 bg-white p-4 shadow-soft"
        >
          <label htmlFor="manual-code" className="label mb-0">
            Código do convite
          </label>
          <div className="flex gap-2">
            <input
              id="manual-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value.toUpperCase())}
              placeholder="EX.: EVENT-8F72AB91-X92K"
              className="input font-mono uppercase"
              autoComplete="off"
              autoCapitalize="characters"
            />
            <Button type="submit" disabled={manualCode.trim().length < 4}>
              Validar
            </Button>
          </div>
          <p className="helper mb-0">Mínimo de 4 caracteres. O código está impresso no convite.</p>
        </form>
      )}
    </div>
  );
}
