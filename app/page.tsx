import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { createClient } from "@/lib/supabase/server";

type HomePageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const supabase = await createClient();
  const [{ data }, params] = await Promise.all([supabase.auth.getUser(), searchParams]);

  if (data.user) {
    redirect("/chat");
  }

  return <LoginForm message={params.message} />;
}
