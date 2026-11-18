import pathlib
p = pathlib.Path('her' + 'mes.py')
t = p.read_text()
NL = chr(10)
# pehle deploy + git wala function jodo
code = NL + "def skill_git_deploy():" + NL + "    import subprocess" + NL + "    a = subprocess.run(['git','add','-A'], cwd='/home/ubuntu/AI-Lead-Conversion-SaaS-CRM', capture_output=True, text=True)" + NL + "    b = subprocess.run(['git','commit','-m','Task 1.1 Auth Tenant done'], cwd='/home/ubuntu/AI-Lead-Conversion-SaaS-CRM', capture_output=True, text=True)" + NL + "    c = subprocess.run(['git','push','origin','master'], cwd='/home/ubuntu/AI-Lead-Conversion-SaaS-CRM', capture_output=True, text=True)" + NL + "    return 'GIT:' + chr(10) + (a.stdout + a.stderr + b.stdout + b.stderr + c.stdout + c.stderr)[-1000:]" + NL
if 'skill_git_deploy' not in t:
    t = t + code
    # deploy wala check sabse pehle le jao - handle_message ke start me
    old = '    if "update de" in text:'
    new = '    if "deploy karo" in text or "deploy" in text and "git" in text:' + NL + '        await update.message.reply_text(skill_git_deploy())' + NL + '        await update.message.reply_text(skill_deploy_real())' + NL + '        return' + NL + '    if "update de" in text:'
    t = t.replace(old, new)
    p.write_text(t)
    print('ORDER FIX HO GAYA')
else:
    print('PEHLE SE HAI')
