'use client';

import { TemplatePreview } from '@/components/platform/TemplatePreview';
import { TemplateEditor } from '@/components/platform/TemplateEditor';
import { archiveBrandingTemplate, createTemplateVersion, getBrandingTemplate, getTemplateUsageStats, publishBrandingTemplate } from '@/lib/actions/branding-templates';
import { BrandingData } from '@/lib/types/branding';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Template detail page
 * View template, create versions, manage settings
 */
export default function TemplateDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [template, setTemplate] = useState<any>();
  const [usage, setUsage] = useState<any>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<'preview' | 'version' | 'usage' | 'settings'>('preview');
  const [userId, setUserId] = useState<string>();

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  useEffect(() => {
    if (userId) {
      loadTemplate();
      loadUsage();
    }
  }, [params.id, userId]);

  const loadTemplate = async () => {
    const result = await getBrandingTemplate(params.id, userId);
    if (result.success) {
      setTemplate(result.template);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  };

  const loadUsage = async () => {
    const result = await getTemplateUsageStats(params.id);
    if (result.success) {
      setUsage(result.stats);
    }
  };

  const handleCreateVersion = async (data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    branding_data: BrandingData;
    visibility: 'private' | 'shared_with_tenants' | 'platform_published';
    thumbnail_url?: string;
  }) => {
    const result = await createTemplateVersion(params.id, data, userId || '');
    if (result.success) {
      router.push(`/platform/branding-templates/${result.template?.id}`);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handlePublish = async () => {
    const result = await publishBrandingTemplate(params.id, userId || '');
    if (result.success) {
      await loadTemplate();
    } else {
      setError(result.error);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Archive this template? It cannot be used by new tenants.')) return;

    const result = await archiveBrandingTemplate(params.id, userId || '');
    if (result.success) {
      router.push('/platform/branding-templates');
    } else {
      setError(result.error);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!template) return <div>Template not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{template.name}</h1>
          <p className="mt-1 text-gray-600">v{template.version}</p>
        </div>
        <div className="flex gap-2">
          {template.visibility !== 'platform_published' && (
            <button onClick={handlePublish} className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              Publish
            </button>
          )}
          {!template.is_archived && (
            <button onClick={handleArchive} className="rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Archive
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          {['preview', 'version', 'usage', 'settings'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-4 py-2 font-medium transition-colors ${
                tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div>
        {tab === 'preview' && <TemplatePreview branding={template.branding_data} />}

        {tab === 'version' && (
          <div className="rounded-lg border border-gray-200 p-6">
            <h2 className="mb-4 text-lg font-semibold">Create New Version</h2>
            <TemplateEditor template={template} onSave={handleCreateVersion} />
          </div>
        )}

        {tab === 'usage' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <div className="text-sm text-gray-600">Total Usage</div>
                <div className="text-3xl font-bold text-blue-600">{usage?.usage_count || 0}</div>
                <div className="text-xs text-gray-600">tenants using this template</div>
              </div>
            </div>

            {usage?.tenants && usage.tenants.length > 0 && (
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold mb-3">Tenants Using This Template</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {usage.tenants.map((t: any, i: number) => (
                      <tr key={i} className="border-t border-gray-100 py-2">
                        <td className="py-2">{t.tenant_name}</td>
                        <td className="text-right text-gray-600">{t.tenant_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-gray-700">Name</div>
                <div className="mt-1 text-gray-900">{template.name}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700">Visibility</div>
                <div className="mt-1 text-gray-900 capitalize">{template.visibility.replace('_', ' ')}</div>
              </div>
            </div>

            {template.description && (
              <div>
                <div className="text-sm font-medium text-gray-700">Description</div>
                <div className="mt-1 text-gray-900">{template.description}</div>
              </div>
            )}

            {template.category && (
              <div>
                <div className="text-sm font-medium text-gray-700">Category</div>
                <div className="mt-1 text-gray-900 capitalize">{template.category}</div>
              </div>
            )}

            {template.tags && template.tags.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700">Tags</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {template.tags.map((tag: string) => (
                    <span key={tag} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <div className="font-medium">Created</div>
                  <div>{new Date(template.created_at).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="font-medium">Version</div>
                  <div>v{template.version}</div>
                </div>
                <div>
                  <div className="font-medium">Status</div>
                  <div>{template.is_archived ? 'Archived' : 'Active'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
