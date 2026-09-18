import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Heart, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { loginSchema, type LoginForm } from '@/lib/validators';
import { authApi } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { APP_NAME } from '@/config/app';

/**
 * Tela de login do painel.
 *
 * Após autenticar, o usuário vai para o destino que tentou acessar (ou para o
 * dashboard). A RECEPÇÃO é levada direto ao controle de entrada, pois é o único
 * recurso que seu perfil possui.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useSession();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // Já autenticado: redireciona para o destino apropriado.
  if (isAuthenticated && user) {
    if (user.role === 'RECEPTIONIST') return <Navigate to="/check-in" replace />;

    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const result = await authApi.login(values.email, values.password);
      const destination =
        result.user.role === 'RECEPTIONIST'
          ? '/check-in'
          : ((location.state as { from?: string } | null)?.from ?? '/dashboard');
      navigate(destination, { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setServerError(error.message);
      } else {
        setServerError('Não foi possível entrar. Verifique sua conexão e tente novamente.');
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-wedding-50 lg:flex-row">
      {/* Lado institucional (desktop) */}
      <div className="relative hidden overflow-hidden bg-wedding-800 lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_30%_20%,#c19a6b_0%,transparent_55%),radial-gradient(circle_at_70%_80%,#505c74_0%,transparent_50%)]" />

        <div className="relative">
          <div className="flex items-center gap-3 text-white">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur">
              <Heart className="h-5 w-5" fill="currentColor" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">{APP_NAME}</p>
              <p className="text-xs text-wedding-400">Convites inteligentes</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-light leading-tight text-white">
            Convites digitais, confirmações organizadas e entrada controlada.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-wedding-300">
            Cadastre convidados, acompanhe as confirmações em tempo real e valide a entrada com um
            QR Code individual no dia do evento.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-wedding-300">
            {[
              'Convite personalizado com link exclusivo',
              'RSVP com controle de acompanhantes',
              'QR Code único por convidado',
              'Controle de entrada com validação no servidor',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-wedding-500">
          Seus dados são tratados conforme a LGPD, apenas para a organização do evento.
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Cabeçalho mobile */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-wedding-900 text-white">
              <Heart className="h-5 w-5" fill="currentColor" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-wedding-900">{APP_NAME}</h1>
            <p className="mt-1 text-sm text-wedding-500">Acesse o painel de gestão</p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h2 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Entrar</h2>
            <p className="mt-1 text-sm text-wedding-500">Acesse com suas credenciais administrativas.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-[42px] h-4 w-4 text-wedding-400"
                aria-hidden
              />
              <Input
                label="E-mail"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                className="pl-10"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-[42px] h-4 w-4 text-wedding-400"
                aria-hidden
              />
              <Input
                label="Senha"
                type="password"
                autoComplete="current-password"
                placeholder="••"
                className="pl-10"
                error={errors.password?.message}
                {...register('password')}
              />
            </div>

            {serverError && (
              <div
                role="alert"
                className="rounded-xl border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
              >
                {serverError}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
              Entrar no painel
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-wedding-400">
            Esqueceu a senha? Fale com o administrador da plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
