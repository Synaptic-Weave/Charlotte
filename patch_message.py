with open('src/domain/entities/Message.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'summary: string;\n  readonly createdAt: Date;',
    'summary: string;\n  recordingUrl: string | null;\n  readonly createdAt: Date;'
)

content = content.replace(
    'summary: string,\n    createdAt: Date,',
    'summary: string,\n    recordingUrl: string | null,\n    createdAt: Date,'
)

content = content.replace(
    'this.summary = summary;\n    this.createdAt = createdAt;',
    'this.summary = summary;\n    this.recordingUrl = recordingUrl;\n    this.createdAt = createdAt;'
)

content = content.replace(
    'return new Message(uuidv4(), tenant, callSession, summary, now, now);',
    'return new Message(uuidv4(), tenant, callSession, summary, null, now, now);'
)

content += """
  updateRecordingUrl(url: string): void {
    this.recordingUrl = url;
    this.updatedAt = new Date();
  }
"""

with open('src/domain/entities/Message.ts', 'w') as f:
    f.write(content)

with open('src/domain/schemas/Message.schema.ts', 'r') as f:
    schema = f.read()

schema = schema.replace(
    "summary: { type: 'text' },\n    createdAt: { type: 'Date' },",
    "summary: { type: 'text' },\n    recordingUrl: { type: 'string', nullable: true },\n    createdAt: { type: 'Date' },"
)

with open('src/domain/schemas/Message.schema.ts', 'w') as f:
    f.write(schema)

print("Patched Message entity.")
