'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Bold, Italic, List, ListOrdered, ImagePlus, Loader2 } from 'lucide-react';
import { uploadForm } from '@/lib/adminApi';

interface UploadedImage {
  url: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export function RichTextEditor({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full' } }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'min-h-[120px] px-3 py-2 text-sm focus:outline-none prose-editor',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await uploadForm<UploadedImage>('/api/v1/admin/content-images', fd);
    setUploading(false);
    if (r.ok && r.data) {
      editor.chain().focus().setImage({ src: `${API_URL}${r.data.url}` }).run();
    } else {
      alert('Tải ảnh thất bại: ' + (r.error || ''));
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  if (!editor) return null;

  return (
    <div className="form-input p-0 overflow-hidden">
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="Đậm">
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="Nghiêng">
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Danh sách">
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Danh sách số">
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <label className={`p-1.5 rounded text-gray-600 transition-colors ${uploading ? 'opacity-50' : 'hover:bg-gray-200 cursor-pointer'}`} title="Chèn ảnh">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" onChange={handleImagePick} className="hidden" disabled={uploading} />
        </label>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

function ToolbarButton({
  active, onClick, label, children,
}: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-gov-100 text-gov-700' : 'text-gray-600 hover:bg-gray-200'}`}
    >
      {children}
    </button>
  );
}
