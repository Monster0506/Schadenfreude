package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Msg struct {
	Type    string   `json:"type"`
	ID      string   `json:"id,omitempty"`
	Room    string   `json:"room,omitempty"`
	Score   int      `json:"score,omitempty"`
	Level   int      `json:"level,omitempty"`
	Lines   int      `json:"lines,omitempty"`
	Gold    int      `json:"gold,omitempty"`
	Players []string `json:"players,omitempty"`
	Creator bool     `json:"creator,omitempty"`
	Board   []int    `json:"board,omitempty"`
}

type Player struct {
	id       string
	conn     *websocket.Conn
	send     chan []byte
	room     *Room
	gameOver bool
}

type Room struct {
	id      string
	creator string
	players map[string]*Player
	mu      sync.Mutex
}

type RoomManager struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

var manager = &RoomManager{rooms: make(map[string]*Room)}

func randID(n int) string {
	const chars = "abcdefghjkmnpqrstuvwxyz23456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func (rm *RoomManager) getOrCreate(id string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if r, ok := rm.rooms[id]; ok {
		return r
	}
	r := &Room{id: id, players: make(map[string]*Player)}
	rm.rooms[id] = r
	return r
}

func (rm *RoomManager) cleanup(id string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	r, ok := rm.rooms[id]
	if !ok {
		return
	}
	r.mu.Lock()
	empty := len(r.players) == 0
	r.mu.Unlock()
	if empty {
		delete(rm.rooms, id)
	}
}

func (r *Room) broadcast(msg []byte, excludeID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, p := range r.players {
		if id == excludeID {
			continue
		}
		select {
		case p.send <- msg:
		default:
			log.Printf("send buffer full: %s", id)
		}
	}
}

func (r *Room) checkWin() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.players) < 2 {
		return
	}
	var alive []*Player
	for _, p := range r.players {
		if !p.gameOver {
			alive = append(alive, p)
		}
	}
	if len(alive) != 1 {
		return
	}
	win, _ := json.Marshal(Msg{Type: "win"})
	select {
	case alive[0].send <- win:
	default:
	}
}

func (r *Room) join(p *Player) {
	r.mu.Lock()
	existing := make([]string, 0, len(r.players))
	for id := range r.players {
		existing = append(existing, id)
	}
	isCreator := len(r.players) == 0
	if isCreator {
		r.creator = p.id
	}
	r.players[p.id] = p
	r.mu.Unlock()

	init, _ := json.Marshal(Msg{Type: "init", ID: p.id, Room: r.id, Players: existing, Creator: isCreator})
	p.send <- init

	joined, _ := json.Marshal(Msg{Type: "player_joined", ID: p.id})
	r.broadcast(joined, p.id)
}

func (r *Room) leave(p *Player) {
	r.mu.Lock()
	delete(r.players, p.id)
	r.mu.Unlock()

	left, _ := json.Marshal(Msg{Type: "player_left", ID: p.id})
	r.broadcast(left, "")

	if !p.gameOver {
		r.checkWin()
	}
	manager.cleanup(r.id)
}

func (p *Player) handle(data []byte) {
	var msg Msg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "game_over":
		p.gameOver = true
		out, _ := json.Marshal(Msg{Type: "game_over", ID: p.id})
		p.room.broadcast(out, "")
		p.room.checkWin()
	case "restart":
		p.gameOver = false
	case "start":
		p.room.mu.Lock()
		isCreator := p.id == p.room.creator
		p.room.mu.Unlock()
		if !isCreator {
			return
		}
		start, _ := json.Marshal(Msg{Type: "start"})
		p.room.broadcast(start, "")
	default:
		msg.ID = p.id
		relayed, _ := json.Marshal(msg)
		p.room.broadcast(relayed, p.id)
	}
}

func (p *Player) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		p.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-p.send:
			p.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				p.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := p.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			p.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := p.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (p *Player) readPump() {
	defer func() {
		p.room.leave(p)
		close(p.send)
	}()
	p.conn.SetReadLimit(1024)
	p.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	p.conn.SetPongHandler(func(string) error {
		p.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, data, err := p.conn.ReadMessage()
		if err != nil {
			break
		}
		p.handle(data)
	}
}
