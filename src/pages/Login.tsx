import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { PasskeyLoginButton } from '@/components/auth/PasskeyLoginButton';
import logo from '@/assets/logo.svg';

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function Login() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && session) {
      navigate('/select-brand');
    }
  }, [session, isLoading, navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-2">
          <img src={logo} alt="Gruppo Benessere" className="h-12 w-auto" />
          <h1 className="text-3xl font-bold">CRM Gruppo Benessere</h1>
        </div>
        <p className="text-muted-foreground">Il cuore digitale di Gruppo Benessere</p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <SocialLoginButtons />
        <Divider label="oppure" />
        <PasskeyLoginButton />
        <Divider label="oppure" />
        <LoginForm />
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground hover:underline">
          Informativa Privacy
        </Link>
      </footer>
    </div>
  );
}
