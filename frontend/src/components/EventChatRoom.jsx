import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';

export default function EventChatRoom({ event, apiUrl, user }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [connection, setConnection] = useState('Connecting…');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef(null);
  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    let active = true;
    let reconnectTimer;

    const connect = async () => {
      if (!active) return;
      setConnection('Connecting…');
      setError('');

      try {
        const ticketResponse = await apiFetch(`${apiUrl}/api/unicore/events/chat-ticket`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: event.event_id })
        });
        const ticketData = await ticketResponse.json().catch(() => ({}));
        if (!ticketResponse.ok || !ticketData.ticket) {
          const message = ticketData.detail || 'Could not join this event chat.';
          if ([401, 403, 404].includes(ticketResponse.status)) {
            if (active) {
              setConnection('Unavailable');
              setError(message);
            }
            return;
          }
          throw new Error(message);
        }

        const socketUrl = new URL(
          `/api/unicore/events/chat/${encodeURIComponent(event.event_id)}`,
          apiUrl
        );
        socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        socketUrl.searchParams.set('ticket', ticketData.ticket);

        const socket = new WebSocket(socketUrl);
        socketRef.current = socket;
        socket.onopen = () => {
          if (active) setConnection('Connected');
        };
        socket.onmessage = (incoming) => {
          if (!active) return;
          try {
            const data = JSON.parse(incoming.data);
            if (data.type === 'history' && Array.isArray(data.messages)) {
              setMessages(data.messages.slice(-100));
            } else if (data.type === 'message' && data.message) {
              setMessages((current) => current.some((item) => item.message_id === data.message.message_id)
                ? current
                : [...current, data.message].slice(-100));
            } else if (data.type === 'error') {
              setError(data.message || 'The message could not be sent.');
              setSending(false);
            }
          } catch (parseError) {
            console.error('Event chat message parse error:', parseError);
            setError('Received an unreadable chat update. Reconnecting…');
          }
        };
        socket.onerror = () => {
          if (active) setConnection('Reconnecting…');
        };
        socket.onclose = () => {
          socketRef.current = null;
          if (active) {
            setConnection('Reconnecting…');
            reconnectTimer = window.setTimeout(connect, 2000);
          }
        };
      } catch (connectError) {
        if (!active) return;
        setConnection('Reconnecting…');
        setError(connectError.message || 'Could not connect to event chat.');
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [apiUrl, event.event_id]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || text.length > 1000 || socketRef.current?.readyState !== WebSocket.OPEN || sending) return;
    setSending(true);
    setError('');
    socketRef.current.send(JSON.stringify({ message: text }));
    setMessage('');
    window.setTimeout(() => setSending(false), 350);
  };

  return (
    <section className="ptm-chat-room" aria-label={`${event.title} event chat`}>
      <div className="ptm-chat-status" role="status">
        <span className={`ptm-chat-indicator ${connection === 'Connected' ? 'connected' : ''}`} />
        {connection}
        <span className="ptm-chat-room-label">{event.title}</span>
      </div>
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      <div className="ptm-chat-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ptm-chat-empty">No messages yet. Start the conversation for this event.</div>
        ) : messages.map((item) => (
          <article
            key={item.message_id}
            className={`ptm-chat-message ${item.student_name === user?.full_name ? 'mine' : ''}`}
          >
            <div className="ptm-chat-message-meta">
              <strong>{item.student_name}</strong>
              <time dateTime={item.created_at}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            <p>{item.message}</p>
          </article>
        ))}
        <div ref={endOfMessagesRef} />
      </div>
      <form className="ptm-chat-compose" onSubmit={handleSubmit}>
        <label className="ptm-sr-only" htmlFor="event-chat-message">Write a message</label>
        <input
          id="event-chat-message"
          className="ptm-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write a message…"
          maxLength={1000}
          autoComplete="off"
        />
        <button
          type="submit"
          className="ptm-btn-primary"
          disabled={!message.trim() || connection !== 'Connected' || sending}
        >
          Send
        </button>
      </form>
    </section>
  );
}
