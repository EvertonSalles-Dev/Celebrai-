import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Car, ExternalLink, MapPin, Save, Sparkles } from 'lucide-react';
import { useEvent, useUpsertVenue } from '@/hooks/useApi';
import { venueFormSchema, type VenueForm, formatZipInput } from '@/lib/validators';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

/**
 * Cadastro do local do evento.
 *
 * Todos os campos necessários para o convidado chegar ao evento: endereço
 * completo, ponto de referência, links do Google Maps e Waze, estacionamento e
 * informações adicionais. A prévia de mapa é exibida quando há coordenadas.
 */
export function VenuePage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [saved, setSaved] = useState(false);

  const { data: event, isLoading, error, refetch } = useEvent(id);
  const upsert = useUpsertVenue(id ?? '');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<VenueForm>({
    resolver: zodResolver(venueFormSchema),
    values: event?.venue
      ? {
        name: event.venue.name,
        type: event.venue.type ?? '',
        address: event.venue.address,
        number: event.venue.number ?? '',
        complement: event.venue.complement ?? '',
        neighborhood: event.venue.neighborhood ?? '',
        city: event.venue.city,
        state: event.venue.state,
        zipCode: event.venue.zipCode ?? '',
        referencePoint: event.venue.referencePoint ?? '',
        googleMapsUrl: event.venue.googleMapsUrl ?? '',
        wazeUrl: event.venue.wazeUrl ?? '',
        parkingInfo: event.venue.parkingInfo ?? '',
        extraInfo: event.venue.extraInfo ?? '',
      }
      : undefined,
    defaultValues: {
      name: '',
      type: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
      referencePoint: '',
      googleMapsUrl: '',
      wazeUrl: '',
      parkingInfo: '',
      extraInfo: '',
    },
  });

  if (isLoading) return <LoadingState label="Carregando local..." />;

  if (error || !event) {
    return <ErrorState title="Evento não encontrado" onRetry={() => void refetch()} />;
  }

  const onSubmit = (values: VenueForm) => {
    upsert.mutate(values, {
      onSuccess: () => {
        setSaved(true);
        toast.success('Local salvo!', 'As informações já aparecem no convite dos convidados.');
        void refetch();
      },
      onError: (error) =>
        toast.error(
          'Não foi possível salvar',
          error instanceof ApiRequestError ? error.message : 'Tente novamente.',
        ),
    });
  };

  const address = watch('address');
  const number = watch('number');
  const city = watch('city');
  const state = watch('state');

  const mapsPreviewUrl =
    event.venue?.latitude && event.venue?.longitude
      ? `https://www.google.com/maps?q=${event.venue.latitude},${event.venue.longitude}&output=embed`
      : null;

  const fullAddress = [address, number, city, state].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <Link
          to={`/eventos/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-wedding-500 transition-colors hover:text-wedding-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.hostsName ?? event.title}
        </Link>

        <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Local do evento</h1>
        <p className="mt-1 text-sm text-wedding-500">
          Estas informações aparecem no convite, com botões "Como chegar" e mapa.
        </p>
      </header>

      {(event.venue || saved) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {/* Prévia do endereço */}
          <div className="card p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-wedding-400">
              <MapPin className="h-3.5 w-3.5" />
              Prévia no convite
            </p>

            <p className="mt-3 text-base font-semibold text-wedding-900">
              {event.venue?.name || 'Nome do local'}
            </p>
            <p className="mt-1 text-sm text-wedding-600">{fullAddress || 'Endereço do evento'}</p>

            {event.venue?.referencePoint && (
              <p className="mt-2 text-xs italic text-wedding-400">{event.venue.referencePoint}</p>
            )}

            <div className="mt-4 flex-wrap gap-2">
              {event.venue?.googleMapsUrl && (
                <a
                  href={event.venue.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary !px-3 !py-2 !text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
              {event.venue?.wazeUrl && (
                <a
                  href={event.venue.wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary !px-3 !py-2 !text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Waze
                </a>
              )}
            </div>
          </div>

          {/* Mapa */}
          <div className="card overflow-hidden">
            {mapsPreviewUrl ? (
              <iframe
                title="Mapa do local do evento"
                src={mapsPreviewUrl}
                className="h-full min-h-[220px] w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
                <MapPin className="h-7 w-7 text-wedding-300" />
                <p className="text-sm text-wedding-400">
                  Preencha as coordenadas para exibir o mapa incorporado
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-6 p-6" noValidate>
        {/* Identificação do local */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Identificação
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome do local"
              placeholder="Ex.: Espaço Jardim Imperial"
              error={errors.name?.message}
              required
              {...register('name')}
            />
            <Input
              label="Tipo do local"
              placeholder="Ex.: Salão de festas"
              error={errors.type?.message}
              {...register('type')}
            />
          </div>
        </fieldset>

        {/* Endereço */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Endereço
          </legend>

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Input
              label="Endereço"
              placeholder="Rua / Avenida"
              error={errors.address?.message}
              required
              {...register('address')}
            />
            <Input label="Número" placeholder="1200" {...register('number')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Complemento" placeholder="Bloco, portão..." {...register('complement')} />
            <Input label="Bairro" placeholder="Centro" {...register('neighborhood')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_100px_140px]">
            <Input
              label="Cidade"
              placeholder="Rio de Janeiro"
              error={errors.city?.message}
              required
              {...register('city')}
            />
            <Input
              label="Estado"
              placeholder="RJ"
              maxLength={2}
              className="uppercase"
              error={errors.state?.message}
              required
              {...register('state')}
            />
            <Input
              label="CEP"
              placeholder="00000-000"
              inputMode="numeric"
              error={errors.zipCode?.message}
              {...register('zipCode', {
                onChange: (event) => {
                  event.target.value = formatZipInput(event.target.value);
                },
              })}
            />
          </div>

          <Input
            label="Ponto de referência"
            placeholder="Ex.: Próximo ao Hotel Nacional"
            error={errors.referencePoint?.message}
            {...register('referencePoint')}
          />
        </fieldset>

        {/* Localização */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Como chegar
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Link do Google Maps"
              type="url"
              placeholder="https://maps.google.com/..."
              error={errors.googleMapsUrl?.message}
              {...register('googleMapsUrl')}
            />
            <Input
              label="Link do Waze"
              type="url"
              placeholder="https://waze.com/ul?..."
              error={errors.wazeUrl?.message}
              {...register('wazeUrl')}
            />
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-wedding-50 p-3.5 text-xs text-wedding-500">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Dica: abra o local no Google Maps, clique em "Compartilhar" e cole o link aqui. No Waze,
            use "Enviar local".
          </p>
        </fieldset>

        {/* Informações extras */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Informações para os convidados
          </legend>

          <Textarea
            label="Estacionamento"
            placeholder="Ex.: Estacionamento gratuito com manobrista das 18h às 2h."
            rows={2}
            error={errors.parkingInfo?.message}
            {...register('parkingInfo')}
          />

          <Textarea
            label="Informações adicionais"
            placeholder="Ex.: Acesso para cadeirantes, área externa coberta, etc."
            rows={2}
            error={errors.extraInfo?.message}
            {...register('extraInfo')}
          />
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-wedding-100 pt-5">
          <Link to={`/eventos/${id}`} className="btn-secondary">
            Cancelar
          </Link>
          <Button
            type="submit"
            icon={<Save className="h-4 w-4" />}
            loading={upsert.isPending}
          >
            Salvar local
          </Button>
        </div>
      </form>

      <p className="mt-4 flex items-center gap-2 text-xs text-wedding-400">
        <Car className="h-3.5 w-3.5" />
        As informações de estacionamento e acesso aparecem na seção "Local do evento" do convite.
      </p>
    </div>
  );
}
