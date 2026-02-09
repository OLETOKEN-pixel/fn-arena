import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLoadingGuard } from "@/components/common/AppLoadingGuard";
import { GlobalMatchEventListener } from "@/components/common/GlobalMatchEventListener";
import { SplineBackground } from "@/components/common/SplineBackground";

// Pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Matches from "./pages/Matches";
import MyMatches from "./pages/MyMatches";
import MatchDetails from "./pages/MatchDetails";
import CreateMatch from "./pages/CreateMatch";
import Profile from "./pages/Profile";
import Teams from "./pages/Teams";
import TeamDetails from "./pages/TeamDetails";
import Wallet from "./pages/Wallet";
import BuyCoins from "./pages/BuyCoins";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import EpicCallback from "./pages/EpicCallback";
import DiscordCallback from "./pages/DiscordCallback";
import Admin from "./pages/Admin";
import AdminMatchDetail from "./pages/AdminMatchDetail";
import AdminUserDetail from "./pages/AdminUserDetail";
import Highlights from "./pages/Highlights";
import Leaderboard from "./pages/Leaderboard";
import Challenges from "./pages/Challenges";
import Rules from "./pages/Rules";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import SplineTest from "./pages/SplineTest";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Component that renders GlobalMatchEventListener when user is authenticated
function AuthenticatedGlobalListeners() {
  const { user } = useAuth();
  
  if (!user) return null;
  
  return <GlobalMatchEventListener userId={user.id} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SplineBackground />
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthenticatedGlobalListeners />
            <AppLoadingGuard>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/matches" element={<Matches />} />
                <Route path="/my-matches" element={<MyMatches />} />
                <Route path="/my-matches/:id" element={<MatchDetails />} />
                <Route path="/matches/:id" element={<MatchDetails />} />
                <Route path="/matches/create" element={<CreateMatch />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/teams/:id" element={<TeamDetails />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/buy" element={<BuyCoins />} />
                <Route path="/payment/success" element={<PaymentSuccess />} />
                <Route path="/payment/cancel" element={<PaymentCancel />} />
                <Route path="/auth/epic/callback" element={<EpicCallback />} />
                <Route path="/auth/discord/callback" element={<DiscordCallback />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/matches/:id" element={<AdminMatchDetail />} />
                <Route path="/admin/users/:id" element={<AdminUserDetail />} />
                <Route path="/admin/spline-test" element={<SplineTest />} />
                <Route path="/highlights" element={<Highlights />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/challenges" element={<Challenges />} />
                <Route path="/rules" element={<Rules />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLoadingGuard>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
