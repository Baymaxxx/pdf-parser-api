import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, Zap, Shield } from 'lucide-react';

const features = [
  { icon: <Zap size={24} />, title: '快速高效', desc: '极速响应，流畅体验' },
  { icon: <Shield size={24} />, title: '安全可靠', desc: '数据安全，值得信赖' },
  { icon: <Star size={24} />, title: '简洁易用', desc: '界面简洁，上手即用' },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* 导航栏 */}
      <nav className="flex items-center justify-between px-8 py-4 bg-white shadow-sm">
        <span className="text-xl font-bold text-slate-800">我的应用</span>
        <div className="flex gap-3">
          <Button variant="ghost" size="sm">登录</Button>
          <Button size="sm">注册</Button>
        </div>
      </nav>

      {/* Hero 区域 */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-24">
        <h1 className="text-5xl font-bold text-slate-800 mb-4">欢迎使用</h1>
        <p className="text-lg text-slate-500 mb-8 max-w-md">
          这是一个简洁、美观、功能完善的基础页面，帮助你快速开始构建应用。
        </p>
        <div className="flex gap-4">
          <Button size="lg">立即开始</Button>
          <Button size="lg" variant="outline">了解更多</Button>
        </div>
      </section>

      {/* 特性卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto px-6 pb-24">
        {features.map((f) => (
          <Card key={f.title} className="text-center hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-center text-blue-500 mb-2">{f.icon}</div>
              <CardTitle className="text-slate-700">{f.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500 text-sm">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 页脚 */}
      <footer className="text-center py-6 text-slate-400 text-sm border-t bg-white">
        © 2024 我的应用 · 保留所有权利
      </footer>
    </div>
  );
};

export default Index;
