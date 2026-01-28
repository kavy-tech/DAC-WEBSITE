# DAC Learning Hub - System Architecture & Design

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  Learning Page   │    │  Admin Panel     │              │
│  │  (learn/index)   │    │  (admin.html)    │              │
│  │                  │    │                  │              │
│  │ - Video Player   │    │ - Dashboard      │              │
│  │ - Progress       │    │ - Module Mgmt    │              │
│  │ - Navigation     │    │ - Chapter Mgmt   │              │
│  │ - Caching        │    │ - Data Import    │              │
│  └────────┬─────────┘    │ - Data Export    │              │
│           │               └────────┬─────────┘              │
│           └──────────────┬─────────┘                        │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTP REST API
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────────────────────────────────────────────┐
│            API LAYER (Express.js)                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  REST Endpoints                                  │ │
│  │  - GET /api/modules                              │ │
│  │  - POST /api/modules                             │ │
│  │  - PUT /api/modules/:id                          │ │
│  │  - DELETE /api/modules/:id                       │ │
│  │  - POST /api/chapters                            │ │
│  │  - PUT /api/chapters/:id                         │ │
│  │  - DELETE /api/chapters/:id                      │ │
│  │  - GET /api/learning-data                        │ │
│  │  - GET/POST /api/import|export                   │ │
│  └──────────────────────────────────────────────────┘ │
│                       │                                │
│  ┌────────────────────▼────────────────────────────┐  │
│  │  Middleware                                     │  │
│  │  - CORS                                         │  │
│  │  - Body Parser                                  │  │
│  │  - Authentication (Admin Key)                   │  │
│  │  - Error Handling                               │  │
│  └────────────────────┬────────────────────────────┘  │
│                       │                                │
└───────────────────────┼────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼──────────────────────────────────────────┐
│      DATABASE LAYER (PostgreSQL)                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  Tables:                                         │
│  ┌─────────────────────────────────────────────┐│
│  │ MODULES                                     ││
│  │ ├─ id (PK)                                  ││
│  │ ├─ module_id (UNIQUE)                       ││
│  │ ├─ title                                    ││
│  │ ├─ description                              ││
│  │ ├─ duration                                 ││
│  │ ├─ created_at                               ││
│  │ └─ updated_at                               ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ CHAPTERS                                    ││
│  │ ├─ id (PK)                                  ││
│  │ ├─ chapter_id (UNIQUE)                      ││
│  │ ├─ module_id (FK → MODULES)                 ││
│  │ ├─ title                                    ││
│  │ ├─ video_id                                 ││
│  │ ├─ duration                                 ││
│  │ ├─ description                              ││
│  │ ├─ links (ARRAY)                            ││
│  │ ├─ created_at                               ││
│  │ └─ updated_at                               ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  Indexes:                                        │
│  ├─ idx_modules_module_id                       │
│  └─ idx_chapters_module_id                      │
│                                                  │
└──────────────────────────────────────────────────┘
```

## 📊 Data Flow Diagram

### Add Module Flow
```
User Input (Admin Panel)
    ↓
Form Submission (HTTP POST)
    ↓
Express Server (server.js)
    ↓
Authentication Check (x-admin-key)
    ↓
Input Validation
    ↓
PostgreSQL INSERT
    ↓
Success Response
    ↓
Dashboard Update
    ↓
Modules Table Refresh
```

### Learning Page Load Flow
```
Learning Page Load (learn/index.html)
    ↓
Load learn.js
    ↓
Initialize YouTube API
    ↓
Call initLearningData()
    ↓
Attempt API Call
    ├─ Success: Use API data
    │           ↓
    │       Render Modules
    │           ↓
    │       User Selects Chapter
    │           ↓
    │       Play Video
    │
    └─ Failure: Fallback to local JSON
                ↓
            Try learning-data.json
                ├─ Success: Use local data
                │
                └─ Failure: Show Error
```

### Import Data Flow
```
Select JSON File
    ↓
Upload (HTTP POST /api/import)
    ↓
Express Server
    ↓
Admin Key Verification
    ↓
Parse JSON
    ↓
BEGIN Transaction
    ↓
DELETE old chapters
    ↓
DELETE old modules
    ↓
INSERT new modules
    ↓
INSERT new chapters
    ↓
COMMIT Transaction
    ↓
Success Response
    ↓
Refresh Admin Panel
```

## 🔐 Security Architecture

```
┌─────────────────────────────────┐
│      Client Request             │
│  (Admin Panel / API Call)        │
└────────────────┬────────────────┘
                 │
        ┌────────▼────────┐
        │ Route Handler   │
        └────────┬────────┘
                 │
        ┌────────▼────────────────────┐
        │ Check Request Type           │
        │ ├─ GET (public)              │
        │ │  └─ Allow                  │
        │ └─ POST/PUT/DELETE (private) │
        │    └─ Check next             │
        └────────┬─────────────────────┘
                 │
        ┌────────▼──────────────────────┐
        │ Check Headers                 │
        │ ├─ Has x-admin-key?           │
        │ │  ├─ No  → Return 401        │
        │ │  └─ Yes → Check value       │
        │ ├─ Matches ADMIN_KEY?         │
        │ │  ├─ No  → Return 401        │
        │ │  └─ Yes → Continue          │
        └────────┬──────────────────────┘
                 │
        ┌────────▼──────────────────────┐
        │ Execute Handler               │
        │ ├─ Validate input             │
        │ ├─ Execute query              │
        │ └─ Return response            │
        └────────┬──────────────────────┘
                 │
        ┌────────▼──────────────────────┐
        │ Response                      │
        │ ├─ Success (200)              │
        │ ├─ Error (400/401/500)        │
        └──────────────────────────────┘
```

## 📱 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Admin Panel (HTML)                      │
│  ┌──────────────────────────────────────────────────────┤
│  │  Sidebar                                              │
│  │  ├─ Dashboard                                         │
│  │  ├─ Modules                                           │
│  │  ├─ Chapters                                          │
│  │  ├─ Data Management                                   │
│  │  └─ Settings                                          │
│  └──────────────────────────────────────────────────────┤
│  │  Main Content Area                                    │
│  │  ├─ Dashboard Section                                 │
│  │  │  ├─ Stats Grid                                     │
│  │  │  ├─ Quick Access Buttons                           │
│  │  ├─ Modules Section                                   │
│  │  │  ├─ Table                                          │
│  │  │  ├─ Edit/Delete Actions                            │
│  │  ├─ Chapters Section                                  │
│  │  │  ├─ Table                                          │
│  │  │  ├─ Edit/Delete Actions                            │
│  │  ├─ Data Management Section                           │
│  │  │  ├─ Export Button                                  │
│  │  │  ├─ Import Form                                    │
│  │  └─ Settings Section                                  │
│  │     ├─ Configuration Info                             │
│  │     └─ System Info                                    │
│  └──────────────────────────────────────────────────────┤
│  │  Modals                                               │
│  │  ├─ Module Modal (Add/Edit)                           │
│  │  └─ Chapter Modal (Add/Edit)                          │
│  │     └─ Tags Input for Links                           │
│  └──────────────────────────────────────────────────────┤
```

## 🔄 State Management

### Admin Panel State
```javascript
// Module Management
- editingModuleId: null or number
- Modules Array: fetched from API

// Chapter Management
- editingChapterId: null or number
- Chapters Array: fetched from API
- currentLinks: Array of URLs

// Forms
- Module Form: title, description, duration
- Chapter Form: title, video_id, duration, description, links

// Alerts
- Alert queue: success/error/info messages
```

### Learning Page State
```javascript
// Data State
- learningData: complete module/chapter structure
- progressData: user watch progress per chapter
- currentModule: selected module object
- currentChapter: selected chapter object

// Player State
- player: YouTube player instance
- youtubeAPIReady: boolean
- maxWatchedTime: seconds watched
- updateInterval: progress tracking interval
```

## 🚀 Deployment Architecture

### Development
```
Local Machine
├─ PostgreSQL (localhost:5432)
├─ Node Server (localhost:5000)
├─ Admin Panel (http://localhost:5000/admin.html)
└─ Learning Page (http://localhost:3000/learn)
```

### Staging
```
Staging Server
├─ PostgreSQL (staging-db.com)
├─ Node Server (staging-api.com)
├─ Admin Panel (https://staging-api.com/admin.html)
└─ Learning Page (https://staging.dac.com/learn)
```

### Production (Supabase)
```
Supabase Cloud
├─ PostgreSQL (project.supabase.co)
├─ Node Server (production-api.com or Vercel/Heroku)
├─ Admin Panel (https://admin.dac.com/admin.html)
└─ Learning Page (https://learn.dac.com/learn)
```

## 📊 API Response Format

### Success Response
```json
{
  "id": 1,
  "module_id": "1",
  "title": "Statistics Fundamentals",
  "description": "...",
  "duration": "2 Days",
  "created_at": "2026-01-27T10:00:00Z",
  "updated_at": "2026-01-27T10:00:00Z"
}
```

### Error Response
```json
{
  "error": "Unauthorized",
  "status": 401
}
```

### List Response
```json
[
  { ... module 1 },
  { ... module 2 },
  { ... module 3 }
]
```

### Complex Response
```json
{
  "modules": [
    {
      "id": 1,
      "module_id": "1",
      "title": "...",
      "chapters": [
        {
          "id": 1,
          "chapter_id": "1.1",
          "title": "...",
          "video_id": "..."
        }
      ]
    }
  ]
}
```

## 🔌 Integration Points

### With Learning Page
- Fetch from `/api/learning-data` on page load
- Fallback to local `learning-data.json`
- Automatic sync when data changes
- No page refresh required

### With YouTube
- Video playback via YouTube IFrame API
- Video ID stored in database
- Progress tracking maintained
- Thumbnail generation from video_id

### With Browser Storage
- Learning progress stored in localStorage
- Persists across sessions
- Falls back to fresh data if cleared

## 📈 Performance Considerations

### Database Optimization
- Indexes on foreign keys
- Connection pooling
- Query optimization
- Cascade delete for referential integrity

### API Optimization
- Minimal response payloads
- Efficient filtering
- Proper HTTP status codes
- Error handling

### Frontend Optimization
- Lazy loading images
- Event delegation
- Efficient DOM updates
- CSS optimization

## 🔄 Update Cycle

```
1. Admin Makes Change in Admin Panel
   ↓
2. HTTP Request to Express Server
   ↓
3. Authentication & Validation
   ↓
4. Database Update (PostgreSQL)
   ↓
5. API Response to Admin Panel
   ↓
6. Table Refresh in Admin Panel
   ↓
7. Users See Updated Content
   (on next page load or via API polling)
```

## 🛡️ Error Handling Strategy

```
Error Occurs
├─ Client Error (4xx)
│  ├─ 400: Bad Request
│  ├─ 401: Unauthorized
│  └─ 404: Not Found
├─ Server Error (5xx)
│  └─ 500: Internal Server Error
└─ Network Error
   ├─ Connection Refused
   ├─ Timeout
   └─ DNS Failure → Fallback to Local Data
```

---

This architecture is:
- ✅ Scalable
- ✅ Maintainable
- ✅ Secure
- ✅ Performant
- ✅ Reliable
- ✅ Production-ready
