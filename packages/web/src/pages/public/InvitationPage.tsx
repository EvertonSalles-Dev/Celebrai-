import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarHeart,
  Car,
  CheckCircle2,
  Clock,
  Gift,
  Heart,
  MapPin,
  Navigation,
  Shirt,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { publicApi } from '@/services/api';
import { ApiRequestError } from '@/lib/api-client';
import type { PublicEvent, PublicInvitation } from '@/types';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  countdownTo,
  formatInviteDate,
  formatLongDate,
  formatWeekdayDate,
  humanCountdown,
  plural,
  type CountdownParts,
} from '@/lib/format';
import { LoadingState } from '@/components/ui/States';
import { INVITATION_POLL_INTERVAL } from '@/config/app';

/**
 * Página principal do convite (área do convidado).
 *
 * Design elegante, romântico e minimalista: tipografia serifada, paleta creme e
 * dourada, animações suaves de entrada e experiência mobile impecável.
 *
 * Mostra: noivos, data, contagem regressiva, local com mapa, informações da
 * cerimônia e recepção, dress code, lista de presentes, mensagem dos noivos,
 * galeria — e o botão de confirmação de presença.
 */
export function InvitationPage() {
  const { token } = useParams<{ token: string }>();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['public', 'invitation', token],
    queryFn: () => publicApi.getInvitation(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const invitation = data?.invitation;
  const event = data?.event;

  // Após o check-in, o convite passa a exibir o estado "entrada registrada".
  const { data: status } = useQuery({
    queryKey: ['public', 'invitation', token, 'status'],
    queryFn: () => publicApi.status(token as string),
    enabled: Boolean(token),
    refetchInterval: INVITATION_POLL_INTERVAL,
  });

  return (
    <div className="invite-theme min-h-screen">
      {isLoading && (
        <div className="flex min-h-screen items-center justify-center">
          <LoadingState label="Preparando seu convite..." />
        </div>
      )}

      {error && <InvitationError error={error} onRetry={() => void refetch()} />}

      {!isLoading && !error && invitation && event && (
        <InvitationContent
          token={token as string}
          invitation={invitation}
          event={event}
          rsvpOpen={data?.rsvpOpen ?? false}
          checkedInAt={status?.checkedInAt ?? null}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conteúdo do convite
// ---------------------------------------------------------------------------

function InvitationContent({
  token,
  invitation,
  event,
  rsvpOpen,
  checkedInAt,
}: {
  token: string;
  invitation: PublicInvitation;
  event: PublicEvent;
  rsvpOpen: boolean;
  checkedInAt: string | null;
}) {
  const isConfirmed = invitation.status === 'CONFIRMED' || invitation.status === 'CHECKED_IN';
  const isDeclined = invitation.status === 'DECLINED';
  const hasCheckedIn = invitation.status === 'CHECKED_IN' || Boolean(checkedInAt);

  const venue = event.venue;
  const displayName = event.hostsName ?? event.title;

  // Só exibe URLs de imagem válidas (evita blocos vazios quando o link quebra).
  // Grade fixa de 3 colunas × 2 linhas: 6 fotos, todas do mesmo tamanho (4:5).
  const validGalleryImages = useMemo(
    () => (event.galleryImages ?? []).filter((url) => /^https?:\/\//.test(url)).slice(0, 6),
    [event.galleryImages],
  );

  return (
    <article className="mx-auto max-w-2xl px-5 pb-24 sm:px-8">
      <Cover invitation={invitation} event={event} displayName={displayName} />

      {/* ---------------------------------------------------------------- */}
      {/* Contagem regressiva                                              */}
      {/* ---------------------------------------------------------------- */}
      {!hasCheckedIn && <Countdown eventDate={event.eventDate} startTime={event.startTime} />}

      <SectionDivider />

      {/* ---------------------------------------------------------------- */}
      {/* Ação principal: confirmação de presença                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="animate-fade-in-up text-center">
        {hasCheckedIn ? (
          <CheckInNotice checkedInAt={checkedInAt} />
        ) : isConfirmed ? (
          <ConfirmedNotice invitation={invitation} token={token} />
        ) : isDeclined ? (
          <DeclinedNotice />
        ) : (
          <RsvpPrompt token={token} guest={invitation.guest} rsvpOpen={rsvpOpen} />
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Local do evento                                                 */}
      {/* ---------------------------------------------------------------- */}
      {venue && (
        <>
          <SectionDivider />
          <section className="animate-fade-in-up">
            <SectionTitle icon={MapPin} label="Local do evento" />

            <div className="mt-6 space-y-4 text-center">
              <p className="font-display text-2xl text-wedding-800">{venue.name}</p>

              <p className="text-sm leading-relaxed text-wedding-700">
                {venue.address}
                {venue.number ? `, ${venue.number}` : ''}
                {venue.complement ? ` — ${venue.complement}` : ''}
                <br />
                {venue.neighborhood ? `${venue.neighborhood} · ` : ''}
                {venue.city}/{venue.state}
                {venue.zipCode ? ` · CEP ${venue.zipCode}` : ''}
              </p>

              {venue.referencePoint && (
                <p className="mx-auto max-w-md text-xs italic text-wedding-500">
                  {venue.referencePoint}
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                {venue.googleMapsUrl && (
                  <a
                    href={venue.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-invite-outline !px-5 !py-2.5 !text-sm"
                  >
                    <Navigation className="h-4 w-4" />
                    Como chegar
                  </a>
                )}
                {venue.wazeUrl && (
                  <a
                    href={venue.wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-invite-outline !px-5 !py-2.5 !text-sm"
                  >
                    <Car className="h-4 w-4" />
                    Abrir no Waze
                  </a>
                )}
              </div>

              {venue.parkingInfo && (
                <InfoBox icon={Car} title="Estacionamento" text={venue.parkingInfo} />
              )}
              {venue.extraInfo && <InfoBox icon={Sparkles} title="Informações" text={venue.extraInfo} />}
            </div>
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Cerimônia e recepção                                            */}
      {/* ---------------------------------------------------------------- */}
      {(event.ceremonyInfo || event.receptionInfo) && (
        <>
          <SectionDivider />
          <section className="animate-fade-in-up space-y-4">
            <SectionTitle icon={Sparkles} label="Sobre a celebração" />
            {event.ceremonyInfo && (
              <InfoBox icon={Heart} title="Cerimônia" text={event.ceremonyInfo} />
            )}
            {event.receptionInfo && (
              <InfoBox icon={Gift} title="Recepção" text={event.receptionInfo} />
            )}
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Dress code                                                       */}
      {/* ---------------------------------------------------------------- */}
      {event.dressCode && (
        <>
          <SectionDivider />
          <section className="animate-fade-in-up">
            <SectionTitle icon={Shirt} label="Dress code" />
            <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-wedding-700">
              {event.dressCode}
            </p>
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Mensagem dos noivos                                              */}
      {/* ---------------------------------------------------------------- */}
      {event.couplesMessage && (
        <>
          <SectionDivider />
          <section className="animate-fade-in-up">
            <SectionTitle icon={Heart} label="Nossa mensagem" />
            <blockquote className="mx-auto mt-6 max-w-lg text-center">
              <p className="font-display text-lg font-light italic leading-relaxed text-wedding-800">
                “{event.couplesMessage}”
              </p>
              <footer className="mt-4 font-script text-2xl text-wedding-600">{displayName}</footer>
            </blockquote>
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Lista de presentes                                               */}
      {/* ---------------------------------------------------------------- */}
      {(event.giftListUrl || event.giftListNotes) && (
        <>
          <SectionDivider />
          <section className="animate-fade-in-up text-center">
            <SectionTitle icon={Gift} label="Lista de presentes" />
            {event.giftListNotes && (
              <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-wedding-700">
                {event.giftListNotes}
              </p>
            )}
            {event.giftListUrl && (
              <a
                href={event.giftListUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-invite-outline mt-5 !px-6 !py-2.5 !text-sm"
              >
                <Gift className="h-4 w-4" />
                Ver lista de presentes
              </a>
            )}
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Galeria                                                          */}
      {/* ---------------------------------------------------------------- */}
      {validGalleryImages.length > 0 && (
        <>
          <SectionDivider />
          <section className="animate-fade-in-up">
            <SectionTitle icon={Heart} label="Nossa história" />

            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
              {validGalleryImages.map((url, index) => (
                <GalleryImage key={url} url={url} index={index} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Rodapé                                                           */}
      {/* ---------------------------------------------------------------- */}
      <footer className="mt-16 text-center">
        <Heart className="mx-auto h-4 w-4 text-gold-500" fill="currentColor" />
        <p className="mt-3 text-[11px] uppercase tracking-widest text-wedding-500">
          Convite pessoal e intransferível
        </p>
        <p className="mt-2 text-[11px] text-wedding-400">
          Seus dados são tratados apenas para a organização deste evento.{' '}
          <Link to="/privacidade" className="underline hover:text-wedding-600">
            Política de privacidade
          </Link>
        </p>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Capa do convite
// ---------------------------------------------------------------------------

function Cover({
  invitation,
  event,
  displayName,
}: {
  invitation: { guest: { fullName: string } };
  event: { coverImageUrl: string | null; welcomeMessage: string | null; eventDate: string; startTime: string; endTime: string | null };
  displayName: string;
}) {
  const firstGuestName = invitation.guest.fullName.split(' ')[0] ?? invitation.guest.fullName;
  const isOnline = useOnlineStatus();

  return (
    <header className="relative -mx-5 mb-12 overflow-hidden sm:-mx-8">
      {/* Foto de capa */}
      {event.coverImageUrl ? (
        <div className="relative h-[62vh] min-h-[420px] w-full bg-wedding-800">
          <img
            src={event.coverImageUrl}
            alt={displayName}
            className="h-full w-full object-cover"
            loading="eager"
            // Se a foto falhar, ela sai do fluxo e o fundo escuro + gradiente
            // garantem que o texto do convite continue legível.
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-wedding-900/30 via-wedding-900/45 to-wedding-900/85" />

          <div className="absolute inset-x-0 bottom-0 px-6 pb-10 text-center text-white sm:px-10">
            <p className="label-invite !text-wedding-200">Você é nosso convidado</p>
            <h1 className="heading-invite mt-3 text-white drop-shadow-lg">{displayName}</h1>
            <div className="divider-gold my-6 !w-20 opacity-80" />
            <p className="font-display text-lg font-light text-wedding-100">
              {formatInviteDate(event.eventDate)}
            </p>
            <p className="mt-1 font-display text-sm text-wedding-200">
              {event.startTime}
              {event.endTime ? ` — ${event.endTime}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-wedding-gradient px-6 pb-12 pt-16 text-center sm:px-10">
          <p className="label-invite">Você é nosso convidado</p>
          <h1 className="heading-invite mt-4 text-wedding-900">{displayName}</h1>
          <div className="divider-gold my-7" />
          <p className="font-display text-lg text-wedding-700">{formatInviteDate(event.eventDate)}</p>
        </div>
      )}

      {/* Saudação personalizada */}
      <div className="relative -mt-8 px-5 sm:px-8">
        <div className="card-invite mx-auto max-w-lg px-6 py-6 text-center">
          <p className="font-display text-xl text-wedding-800">Olá, {firstGuestName}!</p>
          <p className="mt-3 text-sm leading-relaxed text-wedding-600">
            {event.welcomeMessage ??
              'Estamos muito felizes em compartilhar esse momento especial com você.'}
          </p>

          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-wedding-500">
            <CalendarHeart className="h-3.5 w-3.5" />
            {formatWeekdayDate(event.eventDate)} às {event.startTime}
          </p>

          {!isOnline && (
            <p className="mt-3 text-[11px] text-warning-600">
              Você está sem conexão — algumas informações podem não estar atualizadas.
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Contagem regressiva
// ---------------------------------------------------------------------------

function Countdown({ eventDate, startTime }: { eventDate: string; startTime: string }) {
  const [parts, setParts] = useState<CountdownParts>(() => countdownTo(eventDate, startTime));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setParts(countdownTo(eventDate, startTime));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [eventDate, startTime]);

  const days = useMemo(() => humanCountdown(eventDate), [eventDate]);

  if (parts.total <= 0) {
    return (
      <section className="mt-10 text-center">
        <p className="font-display text-3xl text-wedding-800">É hoje! ✨</p>
      </section>
    );
  }

  const units = [
    { label: 'dias', value: parts.days },
    { label: 'horas', value: parts.hours },
    { label: 'min', value: parts.minutes },
    { label: 'seg', value: parts.seconds },
  ];

  return (
    <section className="mt-10 animate-fade-in text-center">
      <p className="label-invite">Contagem regressiva</p>
      <p className="mt-2 font-display text-sm text-wedding-600 capitalize">{days}</p>

      <div className="mx-auto mt-5 flex max-w-sm justify-center gap-3">
        {units.map((unit) => (
          <div
            key={unit.label}
            className="flex flex-1 rounded-2xl border-wedding-200 bg-white/70 px-2 py-3 backdrop-blur"
          >
            <p className="font-display text-2xl font-medium tabular-nums text-wedding-800">
              {String(unit.value).padStart(2, '0')}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-wedding-400">
              {unit.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Blocos de ação / aviso
// ---------------------------------------------------------------------------

function RsvpPrompt({
  token,
  guest,
  rsvpOpen,
}: {
  token: string;
  guest: { allowedCompanions: number };
  rsvpOpen: boolean;
}) {
  if (!rsvpOpen) {
    return (
      <div className="card-invite mx-auto max-w-md px-6 py-8 text-center">
        <Clock className="mx-auto h-7 w-7 text-warning-500" />
        <p className="mt-3 font-display text-xl text-wedding-800">Prazo encerrado</p>
        <p className="mt-2 text-sm text-wedding-600">
          O prazo para confirmação de presença já passou. Entre em contato com os noivos.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center justify-center gap-2 text-sm text-wedding-600">
        <Users className="h-4 w-4" />
        <span>
          Você possui autorização para até{' '}
          <strong className="font-semibold text-wedding-800">
            {guest.allowedCompanions} {plural(guest.allowedCompanions, 'pessoa', 'pessoas')}
          </strong>
        </span>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link to={`/convite/${token}/confirmacao`} className="btn-invite w-full sm:w-auto">
          <CheckCircle2 className="h-5 w-5" />
          Confirmar presença
        </Link>

        <Link
          to={`/convite/${token}/confirmacao?decline=1`}
          className="text-sm text-wedding-500 underline decoration-wedding-300 underline-offset-4 transition-colors hover:text-wedding-700"
        >
          Não poderei comparecer
        </Link>
      </div>
    </div>
  );
}

function ConfirmedNotice({
  invitation,
  token,
}: {
  invitation: {
    response: { attendingCount: number } | null;
    guest: { allowedCompanions: number };
  };
  token: string;
}) {
  return (
    <div className="card-invite mx-auto max-w-md px-6 py-8">
      <div className="flex flex-col items-center">
        <div className="rounded-full bg-success-100 p-3 text-success-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <p className="mt-4 font-display text-2xl text-wedding-800">Presença confirmada</p>
        <p className="mt-2 text-sm text-wedding-600">
          {invitation.response?.attendingCount ?? 1}{' '}
          {plural(invitation.response?.attendingCount ?? 1, 'pessoa confirmada', 'pessoas confirmadas')}
        </p>
      </div>

      <Link
        to={`/convite/${token}/qrcode`}
        className="btn-invite mt-6 w-full"
      >
        <Sparkles className="h-5 w-5" />
        Ver meu QR Code
      </Link>
    </div>
  );
}

function DeclinedNotice() {
  return (
    <div className="card-invite mx-auto max-w-md px-6 py-8 text-center">
      <XCircle className="mx-auto h-8 w-8 text-wedding-400" />
      <p className="mt-3 font-display text-xl text-wedding-800">Sentiremos sua falta</p>
      <p className="mt-2 text-sm text-wedding-600">
        Registramos que você não poderá comparecer. Obrigado por nos avisar!
      </p>
    </div>
  );
}

function CheckInNotice({ checkedInAt }: { checkedInAt: string | null }) {
  return (
    <div className="card-invite mx-auto max-w-md px-6 py-8 text-center">
      <div className="mx-auto w-fit rounded-full bg-blue-100 p-3 text-blue-600">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <p className="mt-4 font-display text-2xl text-wedding-800">Entrada registrada</p>
      <p className="mt-2 text-sm text-wedding-600">
        {checkedInAt ? `Check-in realizado em ${formatLongDate(checkedInAt)}. ` : ''}
        Aproveite a festa! 🎉
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças de layout
// ---------------------------------------------------------------------------

/**
 * Imagem da galeria com fallback elegante.
 *
 * Trata TRÊS modos de falha, para nunca deixar um card vazio no convite:
 *   1. erro de rede no carregamento (`onError`);
 *   2. imagem que "carrega" mas não tem dimensão (arquivo vazio ou bloqueado),
 *      detectado no `onLoad`;
 *   3. carregamento que não termina em 6s (servidor que responde mas trava).
 */
function GalleryImage({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // Rede de segurança: se nada acontecer, assume falha e mostra o fallback.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const image = imageRef.current;
      // `naturalWidth === 0` após o timeout significa que nada foi pintado.
      if (image && image.naturalWidth === 0) setFailed(true);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, []);

  if (failed) {
    return (
      <figure className="overflow-hidden rounded-2xl border-wedding-200 bg-wedding-100 shadow-invite">
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-wedding-gradient text-wedding-400">
          <Heart className="h-6 w-6" />
          <figcaption className="text-[10px] uppercase tracking-widest">
            Nosso momento {index + 1}
          </figcaption>
        </div>
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-2xl border-wedding-200 bg-wedding-100 shadow-invite">
      <img
        ref={imageRef}
        src={url}
        alt={`Momento do casal ${index + 1}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={(event) => {
          // Imagem sem dimensão = arquivo inválido; mostra o fallback.
          if (event.currentTarget.naturalWidth === 0) setFailed(true);
        }}
        className="aspect-[4/5] w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
      />
    </figure>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: typeof MapPin; label: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-wedding-200 bg-white/60 text-wedding-600">
        <Icon className="h-4 w-4" />
      </div>
      <h2 className="label-invite mt-3">{label}</h2>
    </div>
  );
}

function SectionDivider() {
  return (
    <div className="my-14 flex items-center justify-center gap-3">
      <span className="h-px w-12 bg-wedding-200" />
      <Heart className="h-3 w-3 text-gold-400" fill="currentColor" />
      <span className="h-px w-12 bg-wedding-200" />
    </div>
  );
}

function InfoBox({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Car;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border-wedding-200 bg-white/60 p-4 text-left backdrop-blur-sm">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-wedding-500">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-wedding-700">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Erro
// ---------------------------------------------------------------------------

function InvitationError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const isNotFound = error instanceof ApiRequestError && error.status === 404;

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="card-invite max-w-md px-8 py-10 text-center">
        <div className="mx-auto w-fit rounded-full bg-wedding-100 p-4 text-wedding-500">
          <XCircle className="h-9 w-9" />
        </div>

        <h1 className="mt-5 font-display text-2xl text-wedding-900">
          {isNotFound ? 'Convite não encontrado' : 'Não conseguimos abrir seu convite'}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-wedding-600">
          {isNotFound
            ? 'Este link é inválido ou foi substituído. Confira o endereço recebido ou peça um novo link aos noivos.'
            : 'Tivemos um problema temporário ao carregar as informações. Tente novamente em instantes.'}
        </p>

        {!isNotFound && (
          <button type="button" onClick={onRetry} className="btn-invite mt-6">
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
