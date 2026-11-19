import React, { useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { App } from '@capacitor/app';

export default function NativeBottomSheet({ open, onOpenChange, title, description, children }) {
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    let handle;
    App.addListener('backButton', () => {
      if (openRef.current) {
        onOpenChange(false);
      }
    }).then((listener) => { handle = listener; });
    return () => { handle?.remove(); };
  }, [onOpenChange]);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="native-sheet-overlay" />
        <Drawer.Content className="native-sheet" aria-describedby="native-sheet-description">
          <div className="native-sheet-grabber" />
          {title && <Drawer.Title className="native-sheet-title">{title}</Drawer.Title>}
          {description && <Drawer.Description id="native-sheet-description" className="native-sheet-description">{description}</Drawer.Description>}
          <div className="native-sheet-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
