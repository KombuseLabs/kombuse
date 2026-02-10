import { useState, useEffect } from 'react'
import { useCurrentUserProfile, useUpdateProfile } from '@kombuse/ui/hooks'
import { AvatarPicker, getAvatarIcon } from '@kombuse/ui/components'
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle, toast } from '@kombuse/ui/base'
import { LogOut, Save, Loader2 } from 'lucide-react'

export function Profile() {
  const { data: profile, isLoading } = useCurrentUserProfile()
  const updateProfile = useUpdateProfile()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [description, setDescription] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  // Sync form state when profile loads
  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email ?? '')
      setDescription(profile.description ?? '')
      setAvatarUrl(profile.avatar_url ?? '')
    }
  }, [profile])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        Profile not found
      </div>
    )
  }

  const AvatarIcon = getAvatarIcon(avatarUrl)
  const hasChanges =
    name !== profile.name ||
    email !== (profile.email ?? '') ||
    description !== (profile.description ?? '') ||
    avatarUrl !== (profile.avatar_url ?? '')

  const handleSave = () => {
    updateProfile.mutate(
      {
        id: profile.id,
        input: {
          name: name.trim(),
          email: email.trim() || undefined,
          description: description.trim() || undefined,
          avatar_url: avatarUrl || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Profile updated')
        },
      }
    )
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold">Profile</h1>

      <div className="space-y-6">
        {/* Profile header */}
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <AvatarIcon className="size-8 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{profile.name}</p>
              {profile.email && (
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Member since {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Edit form */}
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-description">Description</Label>
              <Textarea
                id="profile-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short bio..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Avatar</Label>
              <AvatarPicker value={avatarUrl} onChange={setAvatarUrl} />
            </div>

            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateProfile.isPending || !name.trim()}
            >
              {updateProfile.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Logout */}
        <Card>
          <CardContent className="pt-6">
            <Button variant="outline" disabled title="Coming soon — requires authentication (#122)">
              <LogOut className="mr-2 size-4" />
              Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
