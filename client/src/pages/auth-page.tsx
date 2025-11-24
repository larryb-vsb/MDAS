import { useState, useEffect } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Shield, BarChart3, Database, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Login form schema
const loginFormSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function AuthPage() {
  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const [checkingMicrosoft, setCheckingMicrosoft] = useState(true);
  const { user, loginMutation } = useAuth();
  const { toast } = useToast();

  // Check if Microsoft OAuth is enabled on the server
  useEffect(() => {
    fetch('/api/auth/microsoft/status')
      .then(res => res.json())
      .then(data => {
        setMicrosoftEnabled(data.microsoftEnabled || false);
        setCheckingMicrosoft(false);
      })
      .catch(() => {
        setMicrosoftEnabled(false);
        setCheckingMicrosoft(false);
      });
  }, []);

  // Email confirmation dialog removed - Microsoft OAuth now directly authenticates users

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // If user is already logged in, redirect to dashboard
  if (user) {
    return <Redirect to="/" />;
  }

  // Handle login form submission
  const onLoginSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col lg:flex-row">
      {/* Mobile header */}
      <div className="lg:hidden bg-gray-900 p-6 text-center border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-2">
          Merchant Management System
        </h1>
        <p className="text-gray-400 text-sm">
          Merchant Management and Datawarehouse
        </p>
      </div>

      {/* Form column */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-8 lg:w-1/2">
        <Card className="w-full max-w-md bg-white border-0 shadow-2xl">
          <CardHeader className="space-y-4 pb-6">
            {/* Desktop header */}
            <div className="hidden lg:block text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Merchant Management System
              </h1>
              <p className="text-gray-600 text-sm">
                Merchant Management and Datawarehouse
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-4">
                {/* Microsoft Sign In Button */}
                {!checkingMicrosoft && (
                  <div className="space-y-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => window.location.href = '/auth/microsoft'}
                      disabled={!microsoftEnabled}
                      data-testid="button-microsoft-login"
                    >
                      <svg className="mr-2 h-5 w-5" viewBox="0 0 23 23" fill="none">
                        <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
                        <rect x="12" y="1" width="10" height="10" fill="#00a4ef"/>
                        <rect x="1" y="12" width="10" height="10" fill="#7fba00"/>
                        <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
                      </svg>
                      <span className="font-medium text-gray-700">
                        {microsoftEnabled ? 'Sign in with Microsoft' : 'Microsoft SSO (Not Configured)'}
                      </span>
                    </Button>
                    
                    {microsoftEnabled && (
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white px-2 text-gray-500">Or continue with</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Username</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter your username" 
                              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password" 
                              placeholder="Enter your password" 
                              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        "Login"
                      )}
                    </Button>
                  </form>
                </Form>
              </div>
          </CardContent>
        </Card>
      </div>

      {/* Features column - Hidden on mobile, shown on desktop */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-purple-700 p-8 items-center justify-center relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-black bg-opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }} />
        </div>

        <div className="relative z-10 max-w-lg text-white">
          <h2 className="text-4xl font-bold mb-6 leading-tight">
            Manage Your Merchants with Confidence
          </h2>
          <p className="text-lg mb-8 text-blue-100 leading-relaxed">
            Our comprehensive merchant management system helps you track transactions, 
            monitor performance, and gain valuable insights to grow your business.
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-400 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-800" />
              </div>
              <span className="text-white font-medium">Powerful dashboard for real-time metrics</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-400 rounded-full flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-green-800" />
              </div>
              <span className="text-white font-medium">Advanced transaction tracking and reporting</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-400 rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-800" />
              </div>
              <span className="text-white font-medium">Secure data management and backup tools</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile features section */}
      <div className="lg:hidden bg-gray-800 p-6 space-y-4">
        <div className="flex items-center space-x-3 text-white">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
          <span className="text-sm">Powerful dashboard for real-time metrics</span>
        </div>
        
        <div className="flex items-center space-x-3 text-white">
          <BarChart3 className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm">Advanced transaction tracking and reporting</span>
        </div>
        
        <div className="flex items-center space-x-3 text-white">
          <Shield className="w-5 h-5 text-purple-400 flex-shrink-0" />
          <span className="text-sm">Secure data management and backup tools</span>
        </div>
      </div>

    </div>
  );
}