import os
import glob
import re

for file in glob.glob('tests/**/*.ts', recursive=True):
    with open(file, 'r') as f:
        content = f.read()

    # Replace : any with : unknown
    content = re.sub(r':\s*any\b', ': unknown', content)
    content = re.sub(r'as\s+any\b', 'as unknown', content)
    content = re.sub(r'<\s*any\s*>', '<unknown>', content)

    # Fix catch (e: any) -> catch (e: unknown)
    content = re.sub(r'catch\s*\(\s*e\s*:\s*any\s*\)', 'catch (e: unknown)', content)
    
    # Fix unused error in catch block
    content = re.sub(r'catch\s*\(\s*e\s*:\s*unknown\s*\)\s*{\s*throw\s+new\s+Error\((.*?)\);\s*}', r'catch (e: unknown) { throw new Error(\1, { cause: e }); }', content)
    
    # Wait, some are just catch(e) but 'e' is never used. Let's just catch () instead of catch(e).
    # But wait, TS catch doesn't always support catch() without parameter. Yes it does since TS 4.0.
    
    with open(file, 'w') as f:
        f.write(content)
