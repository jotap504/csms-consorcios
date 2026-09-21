import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import {
  Bold, Italic, List, ListOrdered, Link2, Undo, Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function ToolbarButton({
  onClick, active, disabled, children, title,
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// value/onChange manejan el HTML como string controlado desde afuera. La ref
// expone insertImage() para que el wizard de campanias pueda insertar una
// imagen generada por IA o subida por archivo en el cursor actual.
const RichTextEditor = forwardRef(({ value, onChange, placeholder }, ref) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExtension.configure({ HTMLAttributes: { style: 'max-width:100%;border-radius:8px;' } }),
      LinkExtension.configure({ openOnClick: false }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'min-h-[220px] px-3 py-2 text-sm leading-relaxed focus:outline-none '
          + '[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 '
          + '[&_a]:text-accent [&_a]:underline [&_strong]:font-semibold',
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useImperativeHandle(ref, () => ({
    insertImage: (url) => editor?.chain().focus().setImage({ src: url }).run(),
  }), [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1.5">
        <ToolbarButton title="Negrita" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Cursiva" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('URL del link:', editor.getAttributes('link').href || 'https://');
            if (url === null) return;
            if (!url) { editor.chain().focus().unsetLink().run(); return; }
            editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton title="Deshacer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Rehacer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
});
RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
