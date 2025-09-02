import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Shield, Link, Calendar, Share2, Twitter, MessageCircle } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SanctuaryApi, LiveSanctuaryApi } from '@/services/api';
import { ApiSanctuaryCreateRequest } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useSanctuaryManager } from '@/hooks/useSanctuaryManager';

// Define form schema
const formSchema = z.object({
  topic: z.string().min(5, { message: "Topic must be at least 5 characters." }).max(100),
  description: z.string().max(500).optional(),
  emoji: z.string().max(2).optional(),
  expireHours: z.number().min(1).max(24).default(1),
  sanctuaryType: z.enum(['anonymous-link', 'scheduled-audio']).default('anonymous-link'),
  scheduledTime: z.date().optional(),
  maxParticipants: z.number().min(2).max(200).default(50),
});

type SanctuaryFormValues = z.infer<typeof formSchema>;

const emojiOptions = ["💭", "❤️", "😊", "😢", "😡", "😨", "🤔", "🙏", "✨", "🌈"];

const CreateSanctuary: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { addSanctuaryToList } = useSanctuaryManager();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topicEthical, setTopicEthical] = useState<boolean | null>(null);
  const [validatingTopic, setValidatingTopic] = useState(false);
  const [createdSession, setCreatedSession] = useState<any>(null);
  const [showShareOptions, setShowShareOptions] = useState(false);

  // Initialize form
  const form = useForm<SanctuaryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      description: "",
      emoji: "💭",
      expireHours: 1,
      sanctuaryType: 'anonymous-link',
      maxParticipants: 50,
    },
  });

  const watchSanctuaryType = form.watch('sanctuaryType');

  // Simulated ethical check - in production, this would call the Gemini API
  const checkTopicEthical = async (topic: string): Promise<boolean> => {
    setValidatingTopic(true);
    
    // Simple validation logic - in production, replace with actual API call
    const bannedTerms = ['illegal', 'drugs', 'suicide', 'self-harm', 'violence', 'weapon'];
    const containsBannedTerm = bannedTerms.some(term => 
      topic.toLowerCase().includes(term)
    );
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setValidatingTopic(false);
    return !containsBannedTerm;
  };

  const onTopicBlur = async () => {
    const topic = form.getValues('topic');
    if (topic.length >= 5) {
      const isEthical = await checkTopicEthical(topic);
      setTopicEthical(isEthical);
      
      if (!isEthical) {
        toast({
          title: "Topic flagged",
          description: "Please choose a topic aligned with Veilo's supportive community guidelines.",
          variant: "destructive"
        });
      }
    }
  };

  const onSubmit = async (values: SanctuaryFormValues) => {
    try {
      setIsSubmitting(true);
      
      // Final ethical check
      const isEthical = await checkTopicEthical(values.topic);
      if (!isEthical) {
        toast({
          title: "Cannot create sanctuary",
          description: "The topic doesn't meet our community guidelines.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Create sanctuary session based on type
      if (values.sanctuaryType === 'anonymous-link') {
        const sanctuaryData: ApiSanctuaryCreateRequest = {
          topic: values.topic,
          description: values.description,
          emoji: values.emoji,
          expireHours: values.expireHours
        };
        
        const response = await SanctuaryApi.createSession(sanctuaryData);
        
        if (response.success && response.data) {
          // Store host token in localStorage with expiry if this is an anonymous host
          if (response.data.hostToken) {
            const expiryDate = new Date();
            expiryDate.setHours(expiryDate.getHours() + 48); // 48 hours
            
            localStorage.setItem(`sanctuary-host-${response.data.id}`, response.data.hostToken);
            localStorage.setItem(`sanctuary-host-${response.data.id}-expires`, expiryDate.toISOString());
            
            // Add to sanctuary management list
            addSanctuaryToList({
              id: response.data.id,
              topic: response.data.topic,
              description: response.data.description,
              emoji: response.data.emoji,
              mode: 'anon-inbox',
              hostToken: response.data.hostToken,
              createdAt: new Date().toISOString(),
              expiresAt: expiryDate.toISOString()
            });
          }
          
          setCreatedSession(response.data);
          setShowShareOptions(true);
          
          toast({
            title: "Anonymous sanctuary created!",
            description: "Your sanctuary link is ready to share."
          });
        } else {
          throw new Error(response.error || "Failed to create sanctuary session");
        }
        } else {
        // Handle scheduled live audio session using flagship sanctuary
        const flagshipSanctuaryData = {
          topic: values.topic,
          description: values.description,
          emoji: values.emoji,
          duration: values.expireHours * 60, // Convert to minutes
          maxParticipants: values.maxParticipants,
          scheduledDateTime: values.scheduledTime?.toISOString(),
          accessType: 'public',
          voiceModulationEnabled: true,
          moderationEnabled: true,
          recordingEnabled: false,
          allowAnonymous: true,
          emergencyContactEnabled: true,
          category: 'support'
        };
        
        // Use proper API service instead of direct fetch
        const response = values.scheduledTime 
          ? await fetch('/api/flagship-sanctuary/schedule', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` // Add auth header
              },
              body: JSON.stringify(flagshipSanctuaryData)
            }).then(res => res.json())
          : await fetch('/api/flagship-sanctuary/create', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` // Add auth header
              },
              body: JSON.stringify(flagshipSanctuaryData)
            }).then(res => res.json());
        
        if (response.success && response.data) {
          // Store host token for anonymous hosts with expiry
          if (response.data.hostToken) {
            const expiryDate = new Date();
            expiryDate.setHours(expiryDate.getHours() + 48); // 48 hours
            
            localStorage.setItem(`flagship-sanctuary-host-${response.data.id}`, response.data.hostToken);
            localStorage.setItem(`flagship-sanctuary-host-${response.data.id}-expires`, expiryDate.toISOString());
            
            // Add to sanctuary management list
            addSanctuaryToList({
              id: response.data.id,
              topic: response.data.topic,
              description: response.data.description,
              emoji: response.data.emoji,
              mode: 'live-audio' as any, // Type assertion for now
              hostToken: response.data.hostToken,
              createdAt: new Date().toISOString(),
              expiresAt: expiryDate.toISOString()
            });
          }
          
          setCreatedSession({
            ...response.data,
            type: 'flagship-audio'
          });
          setShowShareOptions(true);
          
          toast({
            title: "Flagship Audio Sanctuary created!",
            description: "Your live audio space is ready to share."
          });
        } else {
          throw new Error(response.error || "Failed to create flagship sanctuary session");
        }
      }
    } catch (error: any) {
      toast({
        title: "Error creating sanctuary",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareOnTwitter = () => {
    // Different URLs based on sanctuary type
    const url = createdSession.type === 'flagship-audio' 
      ? `${window.location.origin}/flagship/${createdSession.id}`
      : createdSession.type === 'live-audio' 
      ? `${window.location.origin}/sanctuary/live/${createdSession.id}`
      : `${window.location.origin}/sanctuary/submit/${createdSession.id}`;
    const text = `Join me in a safe space to discuss: ${createdSession.topic}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnWhatsApp = () => {
    // Different URLs based on sanctuary type  
    const url = createdSession.type === 'flagship-audio'
      ? `${window.location.origin}/flagship/${createdSession.id}`
      : createdSession.type === 'live-audio'
      ? `${window.location.origin}/sanctuary/live/${createdSession.id}`
      : `${window.location.origin}/sanctuary/submit/${createdSession.id}`;
    const text = `Join me in a safe sanctuary space to discuss: ${createdSession.topic} ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const copyToClipboard = () => {
    // Different URLs based on sanctuary type
    const url = createdSession.type === 'flagship-audio'
      ? `${window.location.origin}/flagship/${createdSession.id}`
      : createdSession.type === 'live-audio'
      ? `${window.location.origin}/sanctuary/live/${createdSession.id}`
      : `${window.location.origin}/sanctuary/submit/${createdSession.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied!",
      description: "Sanctuary link has been copied to your clipboard."
    });
  };

  if (showShareOptions && createdSession) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-center">
            <Shield className="h-5 w-5 text-veilo-purple" />
            Sanctuary Created Successfully!
          </CardTitle>
          <CardDescription className="text-center">
            Your sanctuary space is ready. Share this link with others who need support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h3 className="font-medium mb-2">{createdSession.topic}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {createdSession.description || "A safe space for support and discussion."}
            </p>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                Expires in {form.getValues('expireHours')} hour{form.getValues('expireHours') !== 1 ? 's' : ''}
              </Badge>
              <span className="text-lg">{createdSession.emoji || "💭"}</span>
            </div>
          </div>
          
            <div className="space-y-3">
              <h4 className="font-medium text-center">
                {createdSession.type === 'flagship-audio' 
                  ? 'Share flagship audio sanctuary:' 
                  : createdSession.type === 'live-audio' 
                  ? 'Share live audio space:' 
                  : 'Share anonymous submission link:'
                }
              </h4>
            <div className="grid grid-cols-3 gap-3">
              <Button variant="outline" onClick={shareOnWhatsApp} className="flex flex-col gap-1 h-16">
                <MessageCircle className="h-5 w-5 text-green-600" />
                <span className="text-xs">WhatsApp</span>
              </Button>
              <Button variant="outline" onClick={shareOnTwitter} className="flex flex-col gap-1 h-16">
                <Twitter className="h-5 w-5 text-blue-500" />
                <span className="text-xs">Twitter</span>
              </Button>
              <Button variant="outline" onClick={copyToClipboard} className="flex flex-col gap-1 h-16">
                <Link className="h-5 w-5" />
                <span className="text-xs">Copy Link</span>
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => {
            setShowShareOptions(false);
            setCreatedSession(null);
            form.reset();
          }}>
            Create Another
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/my-sanctuaries')}>
              My Sanctuaries
            </Button>
          <Button variant="veilo-primary" onClick={() => {
            const route = createdSession.type === 'flagship-audio' 
              ? `/flagship/${createdSession.id}`
              : createdSession.type === 'live-audio' 
              ? `/sanctuary/live/${createdSession.id}`
              : `/sanctuary/inbox/${createdSession.id}`;
            navigate(route);
          }}>
            {createdSession.type === 'flagship-audio' ? 'Enter Live Session' : createdSession.type === 'live-audio' ? 'Enter Live Space' : 'View Inbox'}
          </Button>
          </div>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-veilo-purple" />
          Create Sanctuary Space
        </CardTitle>
        <CardDescription>
          Create an anonymous, safe space for emotional support around a specific topic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Sanctuary Type Selection */}
            <FormField
              control={form.control}
              name="sanctuaryType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sanctuary Type</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="radio"
                        id="anonymous-link"
                        value="anonymous-link"
                        checked={field.value === 'anonymous-link'}
                        onChange={() => field.onChange('anonymous-link')}
                        className="hidden"
                      />
                      <label
                        htmlFor="anonymous-link"
                        className={`flex flex-col items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          field.value === 'anonymous-link'
                            ? 'border-veilo-blue bg-veilo-blue/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Link className="h-6 w-6 mb-2" />
                        <h4 className="font-medium">Anonymous Link</h4>
                        <p className="text-xs text-gray-600 text-center mt-1">
                          Create instant anonymous support space
                        </p>
                      </label>
                    </div>
                    
                    <div>
                      <input
                        type="radio"
                        id="scheduled-audio"
                        value="scheduled-audio"
                        checked={field.value === 'scheduled-audio'}
                        onChange={() => field.onChange('scheduled-audio')}
                        className="hidden"
                      />
                      <label
                        htmlFor="scheduled-audio"
                        className={`flex flex-col items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          field.value === 'scheduled-audio'
                            ? 'border-veilo-blue bg-veilo-blue/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Calendar className="h-6 w-6 mb-2" />
                        <h4 className="font-medium">Live Audio</h4>
                        <p className="text-xs text-gray-600 text-center mt-1">
                          Schedule anonymous audio session
                        </p>
                        <Badge variant="outline" className="text-xs mt-1 bg-green-50 text-green-600">Live</Badge>
                      </label>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Topic</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input 
                        placeholder="What would you like to discuss?" 
                        {...field} 
                        onBlur={onTopicBlur}
                        className={
                          topicEthical === true ? "border-green-500" : 
                          topicEthical === false ? "border-red-500" : ""
                        }
                      />
                      {validatingTopic && (
                        <div className="absolute right-3 top-2.5">
                          <div className="h-5 w-5 rounded-full border-2 border-t-veilo-blue animate-spin"></div>
                        </div>
                      )}
                      {topicEthical === true && (
                        <div className="absolute right-3 top-2.5 text-green-500">✓</div>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Choose a supportive topic for discussion.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Show scheduled time input for scheduled-audio */}
            {watchSanctuaryType === 'scheduled-audio' && (
              <FormField
                control={form.control}
                name="scheduledTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Time</FormLabel>
                    <FormControl>
                      <input
                        type="datetime-local"
                        value={field.value ? new Date(field.value.getTime() - field.value.getTimezoneOffset() * 60000).toISOString().slice(0, -1) : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        min={new Date().toISOString().slice(0, -1)}
                      />
                    </FormControl>
                    <FormDescription>
                      Select when this live audio session should start.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Show max participants for scheduled-audio */}
            {watchSanctuaryType === 'scheduled-audio' && (
              <FormField
                control={form.control}
                name="maxParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Participants: {field.value}</FormLabel>
                    <FormControl>
                      <Slider
                        min={2}
                        max={50}
                        step={1}
                        value={[field.value]}
                        onValueChange={(values) => field.onChange(values[0])}
                        className="py-4"
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum number of participants allowed in this session.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add more context to help others understand the space" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emoji"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mood Emoji (Optional)</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {emojiOptions.map(emoji => (
                      <Button
                        key={emoji}
                        type="button"
                        variant={field.value === emoji ? "default" : "outline"}
                        className={`h-10 w-10 p-0 text-lg ${field.value === emoji ? "bg-veilo-purple text-white" : ""}`}
                        onClick={() => form.setValue('emoji', emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expireHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Duration: {field.value} hour{field.value !== 1 ? 's' : ''}</FormLabel>
                  <FormControl>
                    <Slider
                      min={1}
                      max={24}
                      step={1}
                      value={[field.value]}
                      onValueChange={(values) => field.onChange(values[0])}
                      className="py-4"
                    />
                  </FormControl>
                  <FormDescription>
                    Sessions automatically expire after the selected duration.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button 
          onClick={form.handleSubmit(onSubmit)}
          disabled={isSubmitting || topicEthical === false}
          variant="veilo-primary"
        >
          {isSubmitting ? "Creating..." : 
           watchSanctuaryType === 'anonymous-link' ? "Create Anonymous Link" : "Schedule Live Audio"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default CreateSanctuary;
