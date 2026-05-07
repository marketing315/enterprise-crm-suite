import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import logo from '@/assets/logo.svg';

export default function Login() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && session) {
      navigate('/select-brand');
    }
  }, [session, isLoading, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-2">
          <img src={logo} alt="Gruppo Benessere" className="h-12 w-auto" />
          <h1 className="text-3xl font-bold">CRM Gruppo Benessere</h1>
        </div>
        <p className="text-muted-foreground">Il cuore digitale del Gruppo Benessere</p>
      </div>

      <LoginForm />

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground hover:underline">
          Informativa Privacy
        </Link>
      </footer>
    </div>
  );
}
