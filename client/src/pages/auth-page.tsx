import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Shield, BarChart3, Database, CheckCircle2 } from "lucide-react";

// Login form schema
const loginFormSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

// Registration form schema
const registerFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<string>("login");
  const { user, loginMutation, registerMutation } = useAuth();

  // Login form
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Register form
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      email: "",
    },
  });
  
  // If user is already logged in, redirect to dashboard
  // IMPORTANT: Move this after hook declarations to avoid React hook rules violation
  if (user) {
    return <Redirect to="/" />;
  }

  // Handle login form submission
  const onLoginSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  // Handle registration form submission
  const onRegisterSubmit = (values: RegisterFormValues) => {
    // Omit confirmPassword when sending to API
    const { confirmPassword, ...registrationData } = values;
    registerMutation.mutate(registrationData);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col lg:flex-row">
      {/* Mobile header */}
      <div className="lg:hidden bg-gray-900 p-6 text-center border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-2">
          Merchant Management System
        </h1>
        <p className="text-gray-400 text-sm">
          Sign in to your account to continue
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
                Sign in to your account to continue
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <Tabs
              defaultValue="login"
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 w-full mb-6 bg-gray-100">
                <TabsTrigger value="login" className="data-[state=active]:bg-white data-[state=active]:text-gray-900">
                  Login
                </TabsTrigger>
                <TabsTrigger value="register" className="data-[state=active]:bg-white data-[state=active]:text-gray-900">
                  Register
                </TabsTrigger>
              </TabsList>

              {/* Login form */}
              <TabsContent value="login" className="space-y-4">
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
              </TabsContent>

              {/* Registration form */}
              <TabsContent value="register" className="space-y-4">
                <Form {...registerForm}>
                  <form
                    onSubmit={registerForm.handleSubmit(onRegisterSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Username</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Choose a username" 
                              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-700">First Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="First name" 
                                className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={registerForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-700">Last Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Last name" 
                                className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Enter your email (optional)"
                              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Create a password"
                              className="h-12 bg-gray-50 border-gray-200 focus:border-blue-500"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Confirm your password"
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
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
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